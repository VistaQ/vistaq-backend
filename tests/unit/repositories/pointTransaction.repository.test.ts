import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import pointTransactionRepository from '@src/repositories/pointTransaction.repository';
import type { IAward } from '@src/repositories/pointTransaction.repository';

const ddb = mockClient(DynamoDBDocumentClient);
const PREFIX = process.env.TABLE_PREFIX;
const LEDGER_TABLE = `${PREFIX}PointTransactions`;
const GUARDS_TABLE = `${PREFIX}AwardGuards`;
const TOTALS_TABLE = `${PREFIX}PointTotals`;
const SALES_TABLE = `${PREFIX}SalesAwards`;
const BATCHES_TABLE = `${PREFIX}UploadBatches`;

type TransactItems = NonNullable<TransactWriteCommandInput['TransactItems']>;

const cancellation = (codes: string[]) =>
  Object.assign(new Error('Transaction cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });

const transactions = (): TransactItems[] =>
  ddb
    .commandCalls(TransactWriteCommand)
    .map((call) => call.args[0].input.TransactItems!);

beforeEach(() => {
  ddb.reset();
});

describe('awardOnce', () => {
  const award: IAward = {
    user_id: 'agent-1',
    activity: 'prospect_created',
    category: 'prospect',
    points: 25,
    subject_type: 'prospect',
    subject_id: 'prospect-1',
    subject_label: 'Jane Doe',
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the guard, the ledger row and both totals rows in one transaction and returns true', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    await expect(pointTransactionRepository.awardOnce(award)).resolves.toBe(
      true,
    );

    const sent = transactions();
    expect(sent).toHaveLength(1);
    const [guard, ledgerRow, monthTotals, lifetimeTotals] = sent[0];
    expect(sent[0]).toHaveLength(4);

    expect(guard.Put).toMatchObject({
      TableName: GUARDS_TABLE,
      Item: {
        subject_id: 'prospect-1',
        activity: 'prospect_created',
        user_id: 'agent-1',
        points: 25,
        subject_type: 'prospect',
      },
    });

    const ledgerItem = ledgerRow.Put!.Item!;
    expect(ledgerRow.Put!.TableName).toBe(LEDGER_TABLE);
    expect(ledgerItem).toMatchObject({
      user_id: 'agent-1',
      activity: 'prospect_created',
      category: 'prospect',
      points: 25,
      subject_type: 'prospect',
      subject_id: 'prospect-1',
      subject_label: 'Jane Doe',
      created_at: '2026-11-14T10:00:00.000Z',
    });
    expect(ledgerItem.created_at_id).toBe(
      `2026-11-14T10:00:00.000Z#${ledgerItem.id}`,
    );

    const addPoints = {
      UpdateExpression: expect.stringContaining('ADD'),
      ExpressionAttributeValues: { ':points': 25, ':one': 1 },
    };
    expect(monthTotals.Update).toMatchObject({
      TableName: TOTALS_TABLE,
      Key: { user_id: 'agent-1', ym: 202611 },
      ...addPoints,
    });
    expect(lifetimeTotals.Update).toMatchObject({
      TableName: TOTALS_TABLE,
      Key: { user_id: 'agent-1', ym: 0 },
      ...addPoints,
    });
    expect(monthTotals.Update!.UpdateExpression).toContain('#prospect_points');
  });

  it('puts the guard only when no guard exists for the subject', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    await pointTransactionRepository.awardOnce(award);

    expect(transactions()[0][0].Put).toMatchObject({
      ConditionExpression: expect.stringContaining('attribute_not_exists'),
      ExpressionAttributeNames: expect.objectContaining({
        '#subject_id': 'subject_id',
      }),
    });
  });

  it('returns false without throwing when the guard condition fails', async () => {
    ddb
      .on(TransactWriteCommand)
      .rejects(
        cancellation([
          'ConditionalCheckFailed',
          'None',
          'None',
          'None',
        ]),
      );

    await expect(pointTransactionRepository.awardOnce(award)).resolves.toBe(
      false,
    );
  });

  it('rejects when the transaction is cancelled for a reason other than the guard', async () => {
    ddb
      .on(TransactWriteCommand)
      .rejects(cancellation(['None', 'None', 'TransactionConflict', 'None']));

    await expect(pointTransactionRepository.awardOnce(award)).rejects.toThrow();
  });

  it('awards a redelivered or concurrent record once, and each subject its own award', async () => {
    const guarded = new Set<string>();
    const committed: TransactItems[] = [];
    ddb.on(TransactWriteCommand).callsFake(async (input: TransactWriteCommandInput) => {
      const items = input.TransactItems!;
      const guard = items[0].Put!.Item!;
      const guardKey = `${guard.subject_id}|${guard.activity}`;
      if (guarded.has(guardKey)) {
        throw cancellation(['ConditionalCheckFailed', 'None', 'None', 'None']);
      }
      guarded.add(guardKey);
      committed.push(items);
      return {};
    });

    const concurrent = await Promise.all([
      pointTransactionRepository.awardOnce(award),
      pointTransactionRepository.awardOnce(award),
    ]);
    const redelivered = await pointTransactionRepository.awardOnce(award);
    const other = await pointTransactionRepository.awardOnce({
      ...award,
      user_id: 'agent-2',
      subject_id: 'prospect-2',
    });

    expect(concurrent.filter(Boolean)).toHaveLength(1);
    expect(redelivered).toBe(false);
    expect(other).toBe(true);
    expect(committed).toHaveLength(2);
    expect(
      committed.map((items) => items[1].Put!.Item!.subject_id).sort(),
    ).toEqual(['prospect-1', 'prospect-2']);
  });
});

describe('awardWithReversal', () => {
  const YEAR = 2026;
  const MONTH = 10;
  const YM = 202610;
  const NEW_BATCH = 'batch-new';
  const OLD_BATCH = 'batch-old';
  const ACTIVITIES = ['sales_noc', 'sales_fyct', 'sales_ace'] as const;

  interface ISalesAwardRow {
    user_id: string;
    ym_activity: string;
    points: number;
    batch_id: string;
  }

  interface IStore {
    salesAwards?: ISalesAwardRow[];
    batches?: { id: string; year: number; month: number }[];
    priorLedger?: { user_id: string; subject_id: string }[];
  }

  const salesAward = (
    userId: string,
    activity: string,
    points: number,
    batchId: string,
  ): ISalesAwardRow => ({
    user_id: userId,
    ym_activity: `${YM}#${activity}`,
    points,
    batch_id: batchId,
  });

  const batch = (id: string) => ({ id, year: YEAR, month: MONTH });

  function seed({ salesAwards = [], batches = [], priorLedger = [] }: IStore) {
    ddb
      .on(QueryCommand, { TableName: BATCHES_TABLE, IndexName: 'byPeriod' })
      .callsFake((input) => ({
        Items: batches.filter(
          (item) =>
            item.year === input.ExpressionAttributeValues[':year'] &&
            item.month === input.ExpressionAttributeValues[':month'],
        ),
      }));
    ddb
      .on(QueryCommand, { TableName: LEDGER_TABLE, IndexName: 'bySubject' })
      .callsFake((input) => ({
        Items: priorLedger.filter(
          (row) =>
            row.subject_id === input.ExpressionAttributeValues[':batch'] &&
            input.ExpressionAttributeValues[':type'] === 'upload_batch',
        ),
      }));
    ddb.on(BatchGetCommand).callsFake((input) => ({
      Responses: {
        [SALES_TABLE]: (
          input.RequestItems[SALES_TABLE].Keys as {
            user_id: string;
            ym_activity: string;
          }[]
        )
          .map((key) =>
            salesAwards.find(
              (item) =>
                item.user_id === key.user_id &&
                item.ym_activity === key.ym_activity,
            ),
          )
          .filter(Boolean),
      },
    }));
  }

  // DynamoDB cancels a transaction on an item another in-flight one is writing.
  function rejectConcurrentTotalsWrites() {
    const inFlight = new Set<string>();
    const totalsKey = (item: TransactItems[number]) =>
      item.Update?.TableName === TOTALS_TABLE
        ? `${item.Update.Key!.user_id}|${item.Update.Key!.ym}`
        : undefined;
    ddb
      .on(TransactWriteCommand)
      .callsFake(async (input: TransactWriteCommandInput) => {
        const items = input.TransactItems!;
        const keys = items.map(totalsKey);
        if (keys.some((key) => key && inFlight.has(key))) {
          throw cancellation(
            keys.map((key) =>
              key && inFlight.has(key) ? 'TransactionConflict' : 'None',
            ),
          );
        }
        const held = keys.filter((key): key is string => !!key);
        held.forEach((key) => inFlight.add(key));
        try {
          await new Promise((resolve) => setTimeout(resolve, 5));
        } finally {
          held.forEach((key) => inFlight.delete(key));
        }
        return {};
      });
  }

  const puts = (table: string) =>
    transactions()
      .flat()
      .flatMap((item) => (item.Put?.TableName === table ? [item.Put] : []));

  const salesWrites = () =>
    puts(SALES_TABLE)
      .map(({ Item }) => ({
        user_id: Item!.user_id as string,
        activity: (Item!.ym_activity as string).split('#')[1],
        points: Item!.points as number,
        batch_id: Item!.batch_id as string,
      }))
      .sort((a, b) =>
        `${a.user_id}|${a.activity}`.localeCompare(`${b.user_id}|${b.activity}`),
      );

  const ledgerWrites = () =>
    puts(LEDGER_TABLE)
      .map(({ Item }) => ({
        user_id: Item!.user_id as string,
        activity: Item!.activity as string,
        category: Item!.category as string,
        points: Item!.points as number,
        subject_type: Item!.subject_type as string,
        subject_id: Item!.subject_id as string,
      }))
      .sort((a, b) =>
        `${a.user_id}|${a.activity}`.localeCompare(`${b.user_id}|${b.activity}`),
      );

  const award = (userId: string, activity: string, points: number) => ({
    user_id: userId,
    activity,
    points,
    subject_id: NEW_BATCH,
  });

  const run = (awards: ReturnType<typeof award>[]) =>
    pointTransactionRepository.awardWithReversal({
      year: YEAR,
      month: MONTH,
      batchId: NEW_BATCH,
      activities: ACTIVITIES,
      awards,
    });

  it('writes each activity at its full points on a first upload', async () => {
    seed({ batches: [batch(NEW_BATCH)] });
    ddb.on(TransactWriteCommand).resolves({});

    await run([
      award('agent-1', 'sales_noc', 60),
      award('agent-1', 'sales_fyct', 20),
      award('agent-1', 'sales_ace', 10),
    ]);

    expect(salesWrites()).toEqual([
      { user_id: 'agent-1', activity: 'sales_ace', points: 10, batch_id: NEW_BATCH },
      { user_id: 'agent-1', activity: 'sales_fyct', points: 20, batch_id: NEW_BATCH },
      { user_id: 'agent-1', activity: 'sales_noc', points: 60, batch_id: NEW_BATCH },
    ]);
    expect(ledgerWrites()).toEqual(
      [
        ['sales_ace', 10],
        ['sales_fyct', 20],
        ['sales_noc', 60],
      ].map(([activity, points]) => ({
        user_id: 'agent-1',
        activity,
        category: 'sales',
        points,
        subject_type: 'upload_batch',
        subject_id: NEW_BATCH,
      })),
    );
    const totalsAdds = transactions().flatMap((items) =>
      items.flatMap((item) =>
        item.Update?.TableName === TOTALS_TABLE
          ? [item.Update.ExpressionAttributeValues![':points']]
          : [],
      ),
    );
    expect(totalsAdds.sort()).toEqual([10, 10, 20, 20, 60, 60]);
    expect(puts(SALES_TABLE).every((put) => put.ConditionExpression)).toBe(true);
  });

  it('writes only the difference when a corrected upload changes one activity', async () => {
    seed({
      batches: [batch(OLD_BATCH), batch(NEW_BATCH)],
      priorLedger: [{ user_id: 'agent-1', subject_id: OLD_BATCH }],
      salesAwards: [
        salesAward('agent-1', 'sales_noc', 60, OLD_BATCH),
        salesAward('agent-1', 'sales_fyct', 20, OLD_BATCH),
        salesAward('agent-1', 'sales_ace', 10, OLD_BATCH),
      ],
    });
    ddb.on(TransactWriteCommand).resolves({});

    await run([
      award('agent-1', 'sales_noc', 90),
      award('agent-1', 'sales_fyct', 20),
      award('agent-1', 'sales_ace', 10),
    ]);

    expect(transactions()).toHaveLength(1);
    expect(salesWrites()).toEqual([
      { user_id: 'agent-1', activity: 'sales_noc', points: 90, batch_id: NEW_BATCH },
    ]);
    expect(puts(SALES_TABLE)[0].ExpressionAttributeValues).toEqual({
      ':was': 60,
      ':wasBatch': OLD_BATCH,
    });
    expect(ledgerWrites()).toEqual([
      {
        user_id: 'agent-1',
        activity: 'sales_noc',
        category: 'sales',
        points: 30,
        subject_type: 'upload_batch',
        subject_id: NEW_BATCH,
      },
    ]);
    const totals = transactions()[0].flatMap((item) =>
      item.Update?.TableName === TOTALS_TABLE ? [item.Update] : [],
    );
    expect(totals.map((update) => update.Key!.ym)).toContain(0);
    expect(
      totals.every((update) => update.ExpressionAttributeValues![':points'] === 30),
    ).toBe(true);
  });

  it('moves a user dropped from the corrected report to zero', async () => {
    seed({
      batches: [batch(OLD_BATCH), batch(NEW_BATCH)],
      priorLedger: [
        { user_id: 'agent-1', subject_id: OLD_BATCH },
        { user_id: 'agent-2', subject_id: OLD_BATCH },
      ],
      salesAwards: [
        salesAward('agent-1', 'sales_noc', 60, OLD_BATCH),
        salesAward('agent-2', 'sales_noc', 40, OLD_BATCH),
      ],
    });
    ddb.on(TransactWriteCommand).resolves({});

    await run([award('agent-1', 'sales_noc', 60)]);

    expect(salesWrites()).toEqual([
      { user_id: 'agent-2', activity: 'sales_noc', points: 0, batch_id: NEW_BATCH },
    ]);
    expect(ledgerWrites()).toMatchObject([
      { user_id: 'agent-2', activity: 'sales_noc', points: -40 },
    ]);
  });

  it('writes nothing for awards a retry already moved to this batch', async () => {
    seed({
      batches: [batch(NEW_BATCH)],
      salesAwards: [salesAward('agent-1', 'sales_noc', 60, NEW_BATCH)],
    });
    ddb.on(TransactWriteCommand).resolves({});

    await run([award('agent-1', 'sales_noc', 60)]);

    expect(transactions()).toEqual([]);
  });

  it("moves one user's activities one at a time so no award is lost to a transaction conflict", async () => {
    seed({ batches: [batch(NEW_BATCH)] });
    rejectConcurrentTotalsWrites();

    await expect(
      run([
        award('agent-1', 'sales_noc', 60),
        award('agent-1', 'sales_fyct', 20),
        award('agent-1', 'sales_ace', 10),
      ]),
    ).resolves.toBeUndefined();

    expect(salesWrites()).toEqual([
      { user_id: 'agent-1', activity: 'sales_ace', points: 10, batch_id: NEW_BATCH },
      { user_id: 'agent-1', activity: 'sales_fyct', points: 20, batch_id: NEW_BATCH },
      { user_id: 'agent-1', activity: 'sales_noc', points: 60, batch_id: NEW_BATCH },
    ]);
  });

  it('still awards every user in full when several users are moved in one upload', async () => {
    seed({ batches: [batch(NEW_BATCH)] });
    rejectConcurrentTotalsWrites();

    await expect(
      run([
        award('agent-1', 'sales_noc', 60),
        award('agent-1', 'sales_fyct', 20),
        award('agent-1', 'sales_ace', 10),
        award('agent-2', 'sales_noc', 30),
        award('agent-2', 'sales_fyct', 15),
        award('agent-2', 'sales_ace', 5),
      ]),
    ).resolves.toBeUndefined();

    expect(salesWrites().map(({ user_id, activity, points }) => [user_id, activity, points])).toEqual([
      ['agent-1', 'sales_ace', 10],
      ['agent-1', 'sales_fyct', 20],
      ['agent-1', 'sales_noc', 60],
      ['agent-2', 'sales_ace', 5],
      ['agent-2', 'sales_fyct', 15],
      ['agent-2', 'sales_noc', 30],
    ]);
  });
});
