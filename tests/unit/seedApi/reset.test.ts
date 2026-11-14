import { describe, expect, it, vi } from 'vitest';

import { TABLE_NAMES, type TableName } from '@src/constants/tables';

import {
  MAX_PASSES,
  selectSeedItems,
  sweep,
} from '../../../scripts/seed-api/reset';
import type {
  Item,
  KeyAttributes,
  TableItems,
} from '../../../scripts/seed-api/tables';

const KEYS: Partial<KeyAttributes> = {
  AgentCodes: ['agent_code'],
  AwardGuards: ['subject_id', 'activity'],
  EventGroups: ['event_id', 'group_id'],
  PointActivityTypes: ['name'],
  PointConfigs: ['activity'],
  PointTransactions: ['user_id', 'created_at_id'],
};
const keys = Object.fromEntries(
  TABLE_NAMES.map((table) => [table, KEYS[table] ?? ['id']]),
) as KeyAttributes;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SEED_ADMIN = id(1);
const SEED_AGENT = id(2);
const SEED_GROUP = id(3);
const SEED_PROSPECT = id(4);
const SEED_EVENT = id(5);
const SEED_TX = id(6);
const REAL_ADMIN = id(11);
const REAL_AGENT = id(12);
const REAL_GROUP = id(13);
const REAL_PROSPECT = id(14);
const REAL_EVENT = id(15);
const REAL_TX = id(16);

const seed = {
  admin: { id: SEED_ADMIN, email: 'seed-admin@example.com', role: 'admin' },
  agent: { id: SEED_AGENT, email: 'seed-agent-01@example.com', group_id: SEED_GROUP },
  group: { id: SEED_GROUP, name: 'Seed Austin Stars' },
  code: { agent_code: 'SEED0001', user_id: SEED_AGENT },
  prospect: { id: SEED_PROSPECT, agent_id: SEED_AGENT },
  tx: { user_id: SEED_AGENT, created_at_id: `2026-11-15#${SEED_TX}`, id: SEED_TX, subject_id: SEED_PROSPECT },
  guard: { subject_id: SEED_PROSPECT, activity: 'prospect_created' },
  event: { id: SEED_EVENT, event_title: 'Seed: Workshop', created_by: SEED_ADMIN },
  eventLink: { event_id: SEED_EVENT, group_id: SEED_GROUP },
};
const real = {
  admin: { id: REAL_ADMIN, email: 'owner@vistaq.test', role: 'admin' },
  agentInSeedGroup: { id: REAL_AGENT, email: 'agent@vistaq.test', group_id: SEED_GROUP },
  group: { id: REAL_GROUP, name: 'Kuala Lumpur Stars' },
  code: { agent_code: 'AG00001', user_id: REAL_AGENT },
  prospect: { id: REAL_PROSPECT, agent_id: REAL_AGENT },
  tx: { user_id: REAL_AGENT, created_at_id: `2026-11-15#${REAL_TX}`, id: REAL_TX, subject_id: REAL_PROSPECT },
  guard: { subject_id: REAL_PROSPECT, activity: 'prospect_created' },
  eventForSeedGroup: {
    id: REAL_EVENT,
    event_title: 'Q4 Kickoff',
    created_by: REAL_ADMIN,
    group_ids: [REAL_GROUP, SEED_GROUP],
  },
  eventLink: { event_id: REAL_EVENT, group_id: REAL_GROUP },
  eventLinkToSeedGroup: { event_id: REAL_EVENT, group_id: SEED_GROUP },
  activityType: { name: 'prospect_created' },
  pointConfig: { activity: 'prospect_created', points: 10, updated_by: SEED_ADMIN },
};

const stageItems = (): TableItems =>
  new Map<TableName, Item[]>([
    ['Users', [seed.admin, seed.agent, real.admin, real.agentInSeedGroup]],
    ['Groups', [seed.group, real.group]],
    ['AgentCodes', [seed.code, real.code]],
    ['Prospects', [seed.prospect, real.prospect]],
    ['PointTransactions', [seed.tx, real.tx]],
    ['AwardGuards', [seed.guard, real.guard]],
    ['Events', [seed.event, real.eventForSeedGroup]],
    ['EventGroups', [seed.eventLink, real.eventLink, real.eventLinkToSeedGroup]],
    ['PointActivityTypes', [real.activityType]],
    ['PointConfigs', [real.pointConfig]],
  ]);

const selected = (tables: TableItems) =>
  [...tables.values()].flat();

describe('selectSeedItems', () => {
  it('finds seed data by its markers alone and follows seed ids to derived rows', () => {
    const selection = selectSeedItems(stageItems(), keys, []);

    expect(selected(selection.items)).toEqual(
      expect.arrayContaining(Object.values(seed)),
    );
    expect(selection.count).toBe(Object.values(seed).length);
  });

  it('never selects unrelated items, and reports real ones that name a seed id', () => {
    const selection = selectSeedItems(stageItems(), keys, []);

    for (const item of Object.values(real)) {
      expect(selected(selection.items)).not.toContain(item);
    }
    expect(selected(selection.leftInPlace)).toEqual(
      expect.arrayContaining([
        real.agentInSeedGroup,
        real.eventForSeedGroup,
        real.eventLinkToSeedGroup,
        real.pointConfig,
      ]),
    );
  });

  it('selects a recorded item whose marker was edited away', () => {
    const renamed = { id: SEED_GROUP, name: 'Renamed by the frontend team' };
    const tables = new Map<TableName, Item[]>([['Groups', [renamed, real.group]]]);

    expect(selected(selectSeedItems(tables, keys, []).items)).toEqual([]);
    expect(selected(selectSeedItems(tables, keys, [SEED_GROUP]).items)).toEqual([
      renamed,
    ]);
  });
});

describe('sweep', () => {
  const lateTx = { ...seed.tx, created_at_id: `2026-11-16#${id(7)}`, id: id(7) };

  const deps = (scans: TableItems[]) => {
    const log: string[] = [];
    let pass = 0;
    return {
      log,
      deps: {
        scan: vi.fn(async () => scans[Math.min(pass++, scans.length - 1)]),
        remove: vi.fn(async (table: TableName, items: Item[]) => {
          log.push(`remove ${table} ${items.length}`);
        }),
        settle: vi.fn(async () => {
          log.push('settle');
        }),
      },
    };
  };

  it('repeats until two passes in a row find nothing, catching rows that land late', async () => {
    const { deps: d } = deps([
      new Map<TableName, Item[]>([
        ['Users', [seed.agent]],
        ['Prospects', [seed.prospect]],
      ]),
      new Map<TableName, Item[]>([['PointTransactions', [lateTx]]]),
      new Map(),
      new Map(),
    ]);

    const result = await sweep(keys, [], d);

    expect(d.scan).toHaveBeenCalledTimes(4);
    expect(result.passes).toBe(4);
    expect(result.deleted).toEqual({ Users: 1, Prospects: 1, PointTransactions: 1 });
  });

  it('deletes stream sources first and lets the consumers settle before the rest', async () => {
    const { deps: d, log } = deps([
      new Map<TableName, Item[]>([
        ['Users', [seed.agent]],
        ['PointTransactions', [seed.tx]],
        ['Prospects', [seed.prospect]],
      ]),
      new Map(),
      new Map(),
    ]);

    await sweep(keys, [], d);

    expect(log.slice(0, 5)).toEqual([
      'remove Prospects 1',
      'settle',
      'remove PointTransactions 1',
      'remove Users 1',
      'settle',
    ]);
  });

  it('gives up when seed rows keep appearing', async () => {
    const { deps: d } = deps([new Map<TableName, Item[]>([['Users', [seed.agent]]])]);

    await expect(sweep(keys, [], d)).rejects.toThrow(`${MAX_PASSES} passes`);
  });
});
