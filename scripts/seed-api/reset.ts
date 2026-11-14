import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { rmSync } from 'fs';

import { TABLE_NAMES, type TableName } from '@src/constants/tables';

import { findSeedUsers } from './auth';
import {
  SEED_AGENT_CODE,
  SEED_EMAIL,
  SEED_GROUP_PREFIX,
  SEED_SOURCE_PREFIX,
  SEED_TITLE_PREFIX,
} from './plan';
import { describeGrowth, failureDepths, waitForEmptyQueue } from './queues';
import { readRunRecord, recordedIds, runRecordPath } from './record';
import { type IStage, resolveStage, StageError, stageFromArgs } from './stage';
import {
  deleteItems,
  type Item,
  type KeyAttributes,
  keyAttributes,
  scanTables,
  type TableItems,
} from './tables';

export const PROTECTED_TABLES: readonly TableName[] = [
  'PointConfigs',
  'PointActivityTypes',
  'Taxonomies',
  'Labels',
];

// Stream sources go first, while their users still exist, and derived rows
// before the users, groups and links they hang off.
const STREAM_SOURCES: readonly TableName[] = [
  'Prospects',
  'CoachingAttendance',
];
const DERIVED: readonly TableName[] = [
  'PointTransactions',
  'PointTotals',
  'AwardGuards',
  'SalesAwards',
  'UserStats',
  'SalesReportYtd',
  'SalesReportMtd',
  'UploadBatches',
  'ReportJobs',
];
export const DELETE_PHASES: readonly (readonly TableName[])[] = [
  STREAM_SOURCES,
  DERIVED,
  TABLE_NAMES.filter(
    (table) =>
      !PROTECTED_TABLES.includes(table) &&
      !STREAM_SOURCES.includes(table) &&
      !DERIVED.includes(table),
  ),
];

export const MAX_PASSES = 10;
const QUIET_PASSES = 2;
const SETTLE_MS = 30_000;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const IS_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mentions(value: unknown, ids: ReadonlySet<string>): boolean {
  if (typeof value === 'string') {
    return (value.match(UUID) ?? []).some((id) => ids.has(id.toLowerCase()));
  }
  if (Array.isArray(value) || value instanceof Set) {
    return [...(value as Iterable<unknown>)].some((v) => mentions(v, ids));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((v) => mentions(v, ids));
  }
  return false;
}

const text = (item: Item, field: string): string => {
  const value = item[field];
  return typeof value === 'string' ? value : '';
};
const isSeedId = (item: Item, field: string, ids: ReadonlySet<string>) =>
  ids.has(text(item, field).toLowerCase());

// Records anyone can create are seed data only by marker, recorded id or seed
// creator; merely listing a seed id (a real event for a seed group) is not.
const IDENTITY: Partial<
  Record<TableName, (item: Item, ids: ReadonlySet<string>) => boolean>
> = {
  Users: (item, ids) =>
    SEED_EMAIL.test(text(item, 'email')) || isSeedId(item, 'id', ids),
  Groups: (item, ids) =>
    text(item, 'name').startsWith(SEED_GROUP_PREFIX) ||
    isSeedId(item, 'id', ids),
  AgentCodes: (item) => SEED_AGENT_CODE.test(text(item, 'agent_code')),
  Events: (item, ids) =>
    text(item, 'event_title').startsWith(SEED_TITLE_PREFIX) ||
    isSeedId(item, 'id', ids) ||
    isSeedId(item, 'created_by', ids),
  CoachingSessions: (item, ids) =>
    text(item, 'title').startsWith(SEED_TITLE_PREFIX) ||
    isSeedId(item, 'id', ids) ||
    isSeedId(item, 'created_by', ids),
  UploadBatches: (item, ids) =>
    text(item, 'file_name').startsWith(SEED_SOURCE_PREFIX) ||
    isSeedId(item, 'id', ids) ||
    isSeedId(item, 'uploaded_by', ids),
  ReportJobs: (item, ids) => isSeedId(item, 'uploaded_by', ids),
};

// A link belongs to its parent: a real event's link to a seed group stays.
const PARENT_KEY: Partial<Record<TableName, string>> = {
  GroupTrainers: 'group_id',
  EventGroups: 'event_id',
  EventAgents: 'event_id',
  CoachingSessionGroups: 'session_id',
  CoachingSessionAgents: 'session_id',
  CoachingAttendance: 'session_id',
};

// Derived rows belong to the seed when a key or owner field names a seed id.
const OWNER_FIELDS = [
  'id',
  'user_id',
  'agent_id',
  'agent_key',
  'created_by',
  'uploaded_by',
  'batch_id',
  'subject_id',
];

export interface ISelection {
  items: TableItems;
  ids: Set<string>;
  count: number;
  /** Not seed data, but naming a seed id; reported, never deleted. */
  leftInPlace: TableItems;
}

export function selectSeedItems(
  tables: TableItems,
  keys: KeyAttributes,
  seedIds: Iterable<string>,
): ISelection {
  const ids = new Set([...seedIds].map((id) => id.toLowerCase()));
  const chosen = new Map<TableName, Set<Item>>();

  for (let grew = true; grew; ) {
    grew = false;
    for (const [table, items] of tables) {
      if (PROTECTED_TABLES.includes(table)) continue;
      const picked = chosen.get(table) ?? new Set<Item>();
      chosen.set(table, picked);
      const identity = IDENTITY[table];
      const parent = PARENT_KEY[table];
      const fields = [...keys[table], ...OWNER_FIELDS];
      for (const item of items) {
        if (picked.has(item)) continue;
        const isSeed = identity
          ? identity(item, ids)
          : parent
            ? isSeedId(item, parent, ids)
            : fields.some((field) => mentions(item[field], ids));
        if (!isSeed) continue;
        picked.add(item);
        const id = text(item, 'id').toLowerCase();
        if (IS_UUID.test(id) && !ids.has(id)) {
          ids.add(id);
          grew = true;
        }
      }
    }
  }

  const items: TableItems = new Map();
  const leftInPlace: TableItems = new Map();
  let count = 0;
  for (const [table, all] of tables) {
    const picked = chosen.get(table) ?? new Set<Item>();
    if (picked.size) items.set(table, [...picked]);
    count += picked.size;
    const named = all.filter(
      (item) => !picked.has(item) && mentions(item, ids),
    );
    if (named.length) leftInPlace.set(table, named);
  }
  return { items, ids, count, leftInPlace };
}

export interface ISweepDeps {
  scan: () => Promise<TableItems>;
  remove: (table: TableName, items: Item[]) => Promise<void>;
  settle: () => Promise<void>;
  report?: (line: string) => void;
}

export interface ISweepResult {
  passes: number;
  deleted: Partial<Record<TableName, number>>;
  leftInPlace: TableItems;
}

/**
 * Deletes seed items pass by pass until two passes in a row, with the consumers
 * settled in between, find nothing; deletes fire stream writes that land late.
 */
export async function sweep(
  keys: KeyAttributes,
  seedIds: Iterable<string>,
  deps: ISweepDeps,
): Promise<ISweepResult> {
  let ids = new Set(seedIds);
  const deleted: Partial<Record<TableName, number>> = {};
  let leftInPlace: TableItems = new Map();
  let passes = 0;

  for (let quiet = 0; quiet < QUIET_PASSES; ) {
    if (passes === MAX_PASSES) {
      throw new Error(`Seed rows still appear after ${MAX_PASSES} passes`);
    }
    passes++;
    const selection = selectSeedItems(await deps.scan(), keys, ids);
    ids = selection.ids;
    leftInPlace = selection.leftInPlace;
    deps.report?.(`Pass ${passes}: ${selection.count} seed items`);

    if (selection.count === 0) {
      quiet++;
      if (quiet < QUIET_PASSES) await deps.settle();
      continue;
    }
    quiet = 0;
    for (const [phase, tables] of DELETE_PHASES.entries()) {
      let removed = 0;
      for (const table of tables) {
        const items = selection.items.get(table) ?? [];
        if (!items.length) continue;
        await deps.remove(table, items);
        deleted[table] = (deleted[table] ?? 0) + items.length;
        removed += items.length;
      }
      if (phase === 0 && removed) await deps.settle();
    }
    await deps.settle();
  }
  return { passes, deleted, leftInPlace };
}

export interface IResetClients {
  cognito: CognitoIdentityProviderClient;
  dynamo: DynamoDBDocumentClient;
  sqs: SQSClient;
}

export interface IResetOptions {
  dryRun?: boolean;
  recordPath?: string;
  settleMs?: number;
  report?: (line: string) => void;
}

const counts = (tables: TableItems) =>
  [...tables].map(([table, items]) => `${table} ${items.length}`).join(', ');

export async function resetStage(
  stage: IStage,
  clients: IResetClients,
  options: IResetOptions = {},
): Promise<void> {
  const report = options.report ?? (() => undefined);
  const recordPath = options.recordPath ?? runRecordPath(stage.name);
  const statsQueue = stage.queues.StatsQueue;
  if (!statsQueue) throw new StageError(`${stage.name} has no StatsQueue`);

  const record = readRunRecord(recordPath);
  const seedUsers = await findSeedUsers(stage, clients.cognito);
  const seedIds = [
    ...(record ? recordedIds(record) : []),
    ...seedUsers.map((user) => user.sub),
  ];
  report(
    record
      ? `Using the run record from ${record.startedAt} and the seed markers`
      : 'No run record: finding seed data by its markers',
  );
  const keys = await keyAttributes(stage, clients.dynamo);
  const scan = () => scanTables(stage, clients.dynamo);

  if (options.dryRun) {
    const selection = selectSeedItems(await scan(), keys, seedIds);
    report(`Would delete ${selection.count} items: ${counts(selection.items)}`);
    report(`Would delete ${seedUsers.length} Cognito users`);
    if (selection.leftInPlace.size) {
      report(`Would leave in place: ${counts(selection.leftInPlace)}`);
    }
    return;
  }

  const failuresBefore = await failureDepths(stage, clients.sqs);
  const settleMs = options.settleMs ?? SETTLE_MS;
  const result = await sweep(keys, seedIds, {
    scan,
    remove: (table, items) =>
      deleteItems(clients.dynamo, stage.tables[table], keys[table], items),
    settle: async () => {
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      await waitForEmptyQueue(clients.sqs, statsQueue);
    },
    report,
  });

  for (const user of seedUsers) {
    await clients.cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: stage.userPoolId,
        Username: user.username,
      }),
    );
  }
  const remaining = await findSeedUsers(stage, clients.cognito);
  if (remaining.length) {
    throw new Error(`${remaining.length} seed users remain in the user pool`);
  }
  rmSync(recordPath, { force: true });

  report(`Deleted ${seedUsers.length} Cognito users and, by table:`);
  report(
    Object.entries(result.deleted)
      .map(([table, n]) => `${table} ${n}`)
      .join(', ') || 'nothing',
  );
  if (result.leftInPlace.size) {
    report(`Left in place, naming seed ids: ${counts(result.leftInPlace)}`);
  }
  for (const line of describeGrowth(
    failuresBefore,
    await failureDepths(stage, clients.sqs),
  )) {
    report(`Warning: ${line}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const stage = await resolveStage(stageFromArgs(args));
  const dryRun = args.includes('--dry-run');
  console.log(
    `${dryRun ? 'Dry run of the' : 'Running the'} seed reset on ${stage.name}`,
  );
  await resetStage(
    stage,
    {
      cognito: new CognitoIdentityProviderClient({ region: stage.region }),
      dynamo: DynamoDBDocumentClient.from(
        new DynamoDBClient({ region: stage.region }),
      ),
      sqs: new SQSClient({ region: stage.region }),
    },
    { dryRun, report: (line) => console.log(line) },
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
