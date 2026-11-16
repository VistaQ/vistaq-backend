import { describe, it, expect, beforeEach } from 'vitest';

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import prospectRepository, {
  PROSPECT_STAGES,
} from '@src/repositories/prospect.repository';
import type { IProspectCursor } from '@src/repositories/prospect.repository';

const ddb = mockClient(DynamoDBDocumentClient);
const PROSPECTS_TABLE = `${process.env.TABLE_PREFIX}Prospects`;

interface IStoredProspect {
  id: string;
  current_stage: string;
  updated_at: string;
}

const stamp = (day: number) =>
  `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`;

const prospect = (id: string, stage: string, day: number) => ({
  id,
  agent_id: 'agent-1',
  prospect_name: `Prospect ${id}`,
  current_stage: stage,
  prospect_entered_at: stamp(1),
  stage_history: [],
  sales_parts_completed: [],
  products_sold: [],
  created_at: stamp(1),
  updated_at: stamp(day),
});

// Ties keep the order the items are seeded in, as the index returns them.
function seedByStageIndex(items: IStoredProspect[]) {
  ddb.on(QueryCommand).callsFake((input) => {
    const stage = input.ExpressionAttributeValues[':stage'];
    const inStage = items
      .filter((item) => item.current_stage === stage)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const startKey = input.ExclusiveStartKey;
    const from = startKey
      ? inStage.findIndex((item) => item.id === startKey.id) + 1
      : 0;
    const page = inStage.slice(from, from + input.Limit);
    const last = page[page.length - 1];
    return {
      Items: page,
      Count: page.length,
      // DynamoDB returns a key whenever Limit is reached, even at the very end.
      LastEvaluatedKey:
        page.length === input.Limit && last
          ? {
              id: last.id,
              current_stage: last.current_stage,
              updated_at: last.updated_at,
            }
          : undefined,
    };
  });
}

const queryInputs = () =>
  ddb.commandCalls(QueryCommand).map((call) => call.args[0].input);

async function readAllPages(
  stages: readonly string[],
  limit: number,
): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: IProspectCursor | null = {};
  while (cursor) {
    if (pages.length > 50) {
      throw new Error('paging did not terminate');
    }
    const result = await prospectRepository.findPage(stages, limit, cursor);
    pages.push(result.items.map((item) => item.id));
    cursor = result.cursor;
  }
  return pages;
}

const spread = [
  prospect('p1', 'prospect', 9),
  prospect('p2', 'prospect', 7),
  prospect('p3', 'prospect', 2),
  prospect('a1', 'appointment', 8),
  prospect('a2', 'appointment', 4),
  prospect('s1', 'sales', 6),
  prospect('s2', 'sales', 1),
];

beforeEach(() => ddb.reset());

describe('ProspectRepository.findPage', () => {
  it('returns the newest prospects across stages up to the limit, with a cursor', async () => {
    seedByStageIndex(spread);

    const result = await prospectRepository.findPage(PROSPECT_STAGES, 3, {});

    expect(result.items.map((item) => item.id)).toEqual(['p1', 'a1', 'p2']);
    expect(result.cursor).toEqual({
      prospect: {
        lastKey: {
          id: 'p2',
          current_stage: 'prospect',
          updated_at: stamp(7),
        },
      },
      appointment: {
        lastKey: {
          id: 'a1',
          current_stage: 'appointment',
          updated_at: stamp(8),
        },
      },
    });
    expect(queryInputs()).toHaveLength(3);
    for (const input of queryInputs()) {
      expect(input).toMatchObject({
        TableName: PROSPECTS_TABLE,
        IndexName: 'byStage',
        Limit: 3,
        ScanIndexForward: false,
      });
      expect(input.ExclusiveStartKey).toBeUndefined();
    }
  });

  it('continues after the last prospect handed out when given the returned cursor', async () => {
    seedByStageIndex(spread);
    const first = await prospectRepository.findPage(PROSPECT_STAGES, 3, {});
    ddb.resetHistory();

    const second = await prospectRepository.findPage(
      PROSPECT_STAGES,
      3,
      first.cursor!,
    );

    expect(second.items.map((item) => item.id)).toEqual(['s1', 'a2', 'p3']);
    const startKeys = Object.fromEntries(
      queryInputs().map((input) => [
        input.ExpressionAttributeValues![':stage'],
        input.ExclusiveStartKey,
      ]),
    );
    expect(startKeys).toEqual({
      prospect: first.cursor!.prospect!.lastKey,
      appointment: first.cursor!.appointment!.lastKey,
      sales: undefined,
    });
    expect(second.cursor).toEqual({
      prospect: { done: true },
      appointment: { done: true },
      sales: {
        lastKey: { id: 's1', current_stage: 'sales', updated_at: stamp(6) },
      },
    });
  });

  it('queries only the requested stages', async () => {
    seedByStageIndex(spread);

    const result = await prospectRepository.findPage(['sales'], 5, {});

    expect(result.items.map((item) => item.id)).toEqual(['s1', 's2']);
    expect(result.items.every((item) => item.current_stage === 'sales')).toBe(
      true,
    );
    expect(
      queryInputs().map((input) => input.ExpressionAttributeValues![':stage']),
    ).toEqual(['sales']);
  });

  it('does not query a stage the cursor has finished', async () => {
    seedByStageIndex(spread);

    const result = await prospectRepository.findPage(PROSPECT_STAGES, 5, {
      prospect: { done: true },
      appointment: { done: true },
    });

    expect(result.items.map((item) => item.id)).toEqual(['s1', 's2']);
    expect(
      queryInputs().map((input) => input.ExpressionAttributeValues![':stage']),
    ).toEqual(['sales']);
  });

  it('returns no cursor on the last page', async () => {
    seedByStageIndex(spread);

    const pages = await readAllPages(PROSPECT_STAGES, 3);
    const lastPage = await prospectRepository.findPage(PROSPECT_STAGES, 3, {
      prospect: { done: true },
      appointment: { done: true },
      sales: {
        lastKey: { id: 's1', current_stage: 'sales', updated_at: stamp(6) },
      },
    });

    expect(pages).toEqual([['p1', 'a1', 'p2'], ['s1', 'a2', 'p3'], ['s2']]);
    expect(lastPage.items.map((item) => item.id)).toEqual(['s2']);
    expect(lastPage.cursor).toBeNull();
  });

  it('returns no cursor when everything fits on the first page', async () => {
    seedByStageIndex(spread);

    const result = await prospectRepository.findPage(PROSPECT_STAGES, 10, {});

    expect(result.items).toHaveLength(spread.length);
    expect(result.cursor).toBeNull();
  });

  it('returns an empty page and no cursor when no prospect matches', async () => {
    seedByStageIndex([]);

    const result = await prospectRepository.findPage(PROSPECT_STAGES, 3, {});

    expect(result).toEqual({ items: [], cursor: null });
  });

  describe('prospects sharing updated_at across a page boundary', () => {
    const tied = [
      prospect('c-appt-newest', 'appointment', 11),
      prospect('a-tie', 'prospect', 10),
      prospect('b-tie', 'prospect', 10),
      prospect('d-appt-old', 'appointment', 5),
      prospect('e-prospect-old', 'prospect', 3),
    ];
    const newestFirst = [
      'c-appt-newest',
      'a-tie',
      'b-tie',
      'd-appt-old',
      'e-prospect-old',
    ];

    it('hands out every prospect exactly once, newest first, when the boundary splits the tie', async () => {
      seedByStageIndex(tied);

      const pages = await readAllPages(['prospect', 'appointment'], 2);

      expect(pages[0]).toEqual(['c-appt-newest', 'a-tie']);
      expect(pages.flat()).toEqual(newestFirst);
    });

    it.each([1, 2, 3, 4, 5, 6])(
      'hands out every prospect exactly once, newest first, with a limit of %i',
      async (limit) => {
        seedByStageIndex(tied);

        const pages = await readAllPages(['prospect', 'appointment'], limit);

        expect(pages.flat()).toEqual(newestFirst);
      },
    );
  });
});
