import {
  CognitoIdentityProviderClient,
  paginateListUsers,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import type { TableName } from '@src/constants/tables';

import { RUNS_DIR } from './record';
import { type IStage, resolveStage, stageFromArgs } from './stage';
import { type Item, keyAttributes, keyOf, scanTables } from './tables';

export interface ISnapshot {
  stage: string;
  takenAt: string;
  tables: Partial<Record<TableName, Record<string, Item>>>;
  users: string[];
}

export interface ISnapshotClients {
  cognito: CognitoIdentityProviderClient;
  dynamo: DynamoDBDocumentClient;
}

export const snapshotPath = (stage: string): string =>
  join(RUNS_DIR, `${stage}.snapshot.json`);

function canonical(value: unknown): unknown {
  if (value instanceof Set) {
    return [...(value as Set<unknown>)].map(canonical).sort();
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Item)[key])]),
    );
  }
  return value;
}

export async function takeSnapshot(
  stage: IStage,
  clients: ISnapshotClients,
  takenAt = new Date(),
): Promise<ISnapshot> {
  const keys = await keyAttributes(stage, clients.dynamo);
  const tables: ISnapshot['tables'] = {};
  for (const [table, items] of await scanTables(stage, clients.dynamo)) {
    tables[table] = Object.fromEntries(
      items.map((item) => [
        JSON.stringify(keyOf(item, keys[table])),
        canonical(item) as Item,
      ]),
    );
  }

  const users: string[] = [];
  for await (const page of paginateListUsers(
    { client: clients.cognito },
    { UserPoolId: stage.userPoolId },
  )) {
    for (const user of page.Users ?? []) {
      if (user.Username) users.push(user.Username);
    }
  }
  return {
    stage: stage.name,
    takenAt: takenAt.toISOString(),
    tables,
    users: users.sort(),
  };
}

export interface ISnapshotDiff {
  tables: Partial<
    Record<TableName, { added: string[]; removed: string[]; changed: string[] }>
  >;
  users: { added: string[]; removed: string[] };
  unchanged: boolean;
}

export function diffSnapshots(
  before: ISnapshot,
  after: ISnapshot,
): ISnapshotDiff {
  const tables: ISnapshotDiff['tables'] = {};
  const names = new Set([
    ...Object.keys(before.tables),
    ...Object.keys(after.tables),
  ] as TableName[]);
  for (const table of names) {
    const was = before.tables[table] ?? {};
    const now = after.tables[table] ?? {};
    const added = Object.keys(now).filter((key) => !(key in was));
    const removed = Object.keys(was).filter((key) => !(key in now));
    const changed = Object.keys(now).filter(
      (key) =>
        key in was && JSON.stringify(was[key]) !== JSON.stringify(now[key]),
    );
    if (added.length || removed.length || changed.length) {
      tables[table] = { added, removed, changed };
    }
  }
  const users = {
    added: after.users.filter((user) => !before.users.includes(user)),
    removed: before.users.filter((user) => !after.users.includes(user)),
  };
  return {
    tables,
    users,
    unchanged:
      !Object.keys(tables).length &&
      !users.added.length &&
      !users.removed.length,
  };
}

export function describeDiff(diff: ISnapshotDiff): string[] {
  if (diff.unchanged) return ['No change'];
  const lines = Object.entries(diff.tables).map(
    ([table, change]) =>
      `${table}: ${change.added.length} added, ${change.removed.length} removed, ${change.changed.length} changed (${[...change.added, ...change.removed, ...change.changed].slice(0, 3).join(' ')})`,
  );
  if (diff.users.added.length || diff.users.removed.length) {
    lines.push(
      `User pool: ${diff.users.added.length} added, ${diff.users.removed.length} removed`,
    );
  }
  return lines;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (command !== 'save' && command !== 'diff') {
    throw new Error('Usage: snapshot.ts save|diff --stage <stage>');
  }
  const stage = await resolveStage(stageFromArgs(args));
  const clients: ISnapshotClients = {
    cognito: new CognitoIdentityProviderClient({ region: stage.region }),
    dynamo: DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: stage.region }),
    ),
  };
  const path = snapshotPath(stage.name);
  const current = await takeSnapshot(stage, clients);

  if (command === 'save') {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(current));
    console.log(`Saved ${stage.name} to ${path}`);
    return;
  }
  const saved = JSON.parse(readFileSync(path, 'utf8')) as ISnapshot;
  const diff = diffSnapshots(saved, current);
  console.log(`${stage.name} against the snapshot from ${saved.takenAt}:`);
  for (const line of describeDiff(diff)) console.log(line);
  if (!diff.unchanged) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
