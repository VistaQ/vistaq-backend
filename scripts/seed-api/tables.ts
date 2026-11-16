import { DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  type DynamoDBDocumentClient,
  paginateScan,
} from '@aws-sdk/lib-dynamodb';

import { TABLE_NAMES, type TableName } from '@src/constants/tables';

import type { IStage } from './stage';

export type Item = Record<string, unknown>;
export type TableItems = Map<TableName, Item[]>;
export type KeyAttributes = Record<TableName, string[]>;

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 8;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function keyAttributes(
  stage: IStage,
  dynamo: DynamoDBDocumentClient,
): Promise<KeyAttributes> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (table) => {
      const { Table } = await dynamo.send(
        new DescribeTableCommand({ TableName: stage.tables[table] }),
      );
      const schema = Table?.KeySchema ?? [];
      const names = ['HASH', 'RANGE'].flatMap((type) =>
        schema
          .filter((key) => key.KeyType === type)
          .map((key) => key.AttributeName!),
      );
      if (!names.length) throw new Error(`${stage.tables[table]} has no key`);
      return [table, names] as const;
    }),
  );
  return Object.fromEntries(entries) as KeyAttributes;
}

export async function scanTables(
  stage: IStage,
  dynamo: DynamoDBDocumentClient,
): Promise<TableItems> {
  const entries = await Promise.all(
    TABLE_NAMES.map(async (table) => {
      const items: Item[] = [];
      for await (const page of paginateScan(
        { client: dynamo },
        { TableName: stage.tables[table], ConsistentRead: true },
      )) {
        items.push(...((page.Items ?? []) as Item[]));
      }
      return [table, items] as const;
    }),
  );
  return new Map(entries);
}

export const keyOf = (item: Item, attributes: readonly string[]): Item =>
  Object.fromEntries(attributes.map((name) => [name, item[name]]));

export async function deleteItems(
  dynamo: DynamoDBDocumentClient,
  tableName: string,
  attributes: readonly string[],
  items: readonly Item[],
): Promise<void> {
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    let requests = items
      .slice(start, start + BATCH_SIZE)
      .map((item) => ({ DeleteRequest: { Key: keyOf(item, attributes) } }));
    for (let attempt = 1; requests.length; attempt++) {
      if (attempt > MAX_ATTEMPTS) {
        throw new Error(`${tableName}: ${requests.length} deletes unprocessed`);
      }
      const { UnprocessedItems } = await dynamo.send(
        new BatchWriteCommand({ RequestItems: { [tableName]: requests } }),
      );
      requests = (UnprocessedItems?.[tableName] ?? []) as typeof requests;
      if (requests.length) await wait(100 * 2 ** attempt);
    }
  }
}
