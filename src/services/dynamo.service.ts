import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

import type { TableName } from '@src/constants/tables';
import {
  DynamoConditionFailedError,
  DynamoServiceError,
} from '@src/models/errors/dynamo.error';
import EnvVars from '@src/utils/env';
import { nowUtc } from '@src/utils/period';

/******************************************************************************
                              Types
******************************************************************************/

export type IKey = Record<string, string | number>;
export type IValues = Record<string, unknown>;

export interface IConditionOptions {
  condition?: string;
  values?: IValues;
}

export interface IQueryParams {
  table: string;
  index?: string;
  keyCondition: string;
  values: IValues;
  filter?: string;
  limit?: number;
  descending?: boolean;
  consistent?: boolean;
  startKey?: Record<string, unknown>;
  count?: boolean;
}

export interface IQueryResult<T> {
  items: T[];
  lastKey?: Record<string, unknown>;
  count: number;
}

export type ITransactItem =
  | {
      put: { table: string; item: Record<string, unknown> } & IConditionOptions;
    }
  | {
      update: {
        table: string;
        key: IKey;
        expression: string;
        values?: IValues;
        condition?: string;
      };
    }
  | { delete: { table: string; key: IKey } & IConditionOptions }
  | {
      conditionCheck: { table: string; key: IKey; condition: string } & {
        values?: IValues;
      };
    };

const BATCH_GET_LIMIT = 100;
const MAX_BATCH_RETRIES = 5;

const EXPRESSION_WORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'BETWEEN',
  'IN',
  'SET',
  'REMOVE',
  'ADD',
  'DELETE',
]);

/******************************************************************************
                          Expression helpers
******************************************************************************/

/**
 * Replaces every plain attribute name in an expression with a `#name`
 * placeholder, so reserved words such as `name` and `status` need no escaping.
 * Value placeholders (`:x`), existing aliases (`#x`), function names (`f(`)
 * and expression keywords are left alone.
 */
export function aliasNames(expression: string): {
  expression: string;
  names: Record<string, string>;
} {
  const names: Record<string, string> = {};
  const aliased = expression.replace(
    /([:#]?)\b([A-Za-z_][A-Za-z0-9_]*)\b(\s*\()?/g,
    (match, prefix: string, word: string, call?: string) => {
      if (prefix || call || EXPRESSION_WORDS.has(word.toUpperCase())) {
        return match;
      }
      names[`#${word}`] = word;
      return `#${word}`;
    },
  );
  return { expression: aliased, names };
}

function nonEmpty(
  names: Record<string, string>,
): Record<string, string> | undefined {
  return Object.keys(names).length ? names : undefined;
}

interface IConditionInput {
  ConditionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: IValues;
}

function conditionInput(options?: IConditionOptions): IConditionInput {
  if (!options?.condition) {
    return {};
  }
  const { expression, names } = aliasNames(options.condition);
  return {
    ConditionExpression: expression,
    ExpressionAttributeNames: nonEmpty(names),
    ...(options.values && { ExpressionAttributeValues: options.values }),
  };
}

function isConditionFailure(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'ConditionalCheckFailedException') {
    return true;
  }
  if (name === 'TransactionCanceledException') {
    const reasons = (error as { CancellationReasons?: { Code?: string }[] })
      .CancellationReasons;
    return !!reasons?.some(
      (reason) => reason.Code === 'ConditionalCheckFailed',
    );
  }
  return false;
}

function wrap(context: string, error: unknown): never {
  if (isConditionFailure(error)) {
    throw new DynamoConditionFailedError();
  }
  throw new DynamoServiceError(`${context} failed`, error);
}

/******************************************************************************
                              DynamoService
******************************************************************************/

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

class DynamoService {
  async get<T>(
    table: string,
    key: IKey,
    options?: { consistent?: boolean },
  ): Promise<T | undefined> {
    try {
      const result = await client.send(
        new GetCommand({
          TableName: table,
          Key: key,
          ConsistentRead: options?.consistent,
        }),
      );
      return result.Item as T | undefined;
    } catch (error) {
      return wrap('DynamoService.get', error);
    }
  }

  async put(
    table: string,
    item: Record<string, unknown>,
    options?: IConditionOptions,
  ): Promise<void> {
    try {
      await client.send(
        new PutCommand({
          TableName: table,
          Item: item,
          ...conditionInput(options),
        }),
      );
    } catch (error) {
      return wrap('DynamoService.put', error);
    }
  }

  async update<T>(
    table: string,
    key: IKey,
    expression: string,
    options?: IConditionOptions,
  ): Promise<T | undefined> {
    try {
      const update = aliasNames(expression);
      const condition = conditionInput(options);
      const result = await client.send(
        new UpdateCommand({
          TableName: table,
          Key: key,
          UpdateExpression: update.expression,
          ExpressionAttributeNames: nonEmpty({
            ...update.names,
            ...condition.ExpressionAttributeNames,
          }),
          ...(options?.values && {
            ExpressionAttributeValues: options.values,
          }),
          ...(condition.ConditionExpression && {
            ConditionExpression: condition.ConditionExpression,
          }),
          ReturnValues: 'ALL_NEW',
        }),
      );
      return result.Attributes as T | undefined;
    } catch (error) {
      return wrap('DynamoService.update', error);
    }
  }

  async delete(
    table: string,
    key: IKey,
    options?: IConditionOptions,
  ): Promise<void> {
    try {
      await client.send(
        new DeleteCommand({
          TableName: table,
          Key: key,
          ...conditionInput(options),
        }),
      );
    } catch (error) {
      return wrap('DynamoService.delete', error);
    }
  }

  /** Runs one query call. Use queryAll to follow pagination. */
  async query<T>(params: IQueryParams): Promise<IQueryResult<T>> {
    try {
      const keyCondition = aliasNames(params.keyCondition);
      const filter = params.filter ? aliasNames(params.filter) : undefined;
      const result = await client.send(
        new QueryCommand({
          TableName: params.table,
          IndexName: params.index,
          KeyConditionExpression: keyCondition.expression,
          FilterExpression: filter?.expression,
          ExpressionAttributeNames: nonEmpty({
            ...keyCondition.names,
            ...filter?.names,
          }),
          ExpressionAttributeValues: params.values,
          Limit: params.limit,
          ScanIndexForward: params.descending ? false : undefined,
          ConsistentRead: params.consistent,
          ExclusiveStartKey: params.startKey,
          Select: params.count ? 'COUNT' : undefined,
        }),
      );
      return {
        items: (result.Items ?? []) as T[],
        lastKey: result.LastEvaluatedKey,
        count: result.Count ?? 0,
      };
    } catch (error) {
      return wrap('DynamoService.query', error);
    }
  }

  /** Follows pagination until the data ends or `limit` items are collected. */
  async queryAll<T>(params: IQueryParams): Promise<T[]> {
    try {
      const items: T[] = [];
      let startKey = params.startKey;
      do {
        const page = await this.query<T>({ ...params, startKey });
        items.push(...page.items);
        startKey = page.lastKey;
      } while (startKey && (!params.limit || items.length < params.limit));
      return params.limit ? items.slice(0, params.limit) : items;
    } catch (error) {
      return wrap('DynamoService.queryAll', error);
    }
  }

  /** Reads every item. Only for the tiny lookup tables that have no index. */
  async scanAll<T>(table: string): Promise<T[]> {
    try {
      const items: T[] = [];
      let startKey: Record<string, unknown> | undefined;
      do {
        const page = await client.send(
          new ScanCommand({ TableName: table, ExclusiveStartKey: startKey }),
        );
        items.push(...((page.Items ?? []) as T[]));
        startKey = page.LastEvaluatedKey;
      } while (startKey);
      return items;
    } catch (error) {
      return wrap('DynamoService.scanAll', error);
    }
  }

  async batchGet<T>(table: string, keys: IKey[]): Promise<T[]> {
    try {
      const items: T[] = [];
      for (let i = 0; i < keys.length; i += BATCH_GET_LIMIT) {
        let pending: IKey[] | undefined = keys.slice(i, i + BATCH_GET_LIMIT);
        for (
          let attempt = 0;
          pending?.length && attempt <= MAX_BATCH_RETRIES;
          attempt++
        ) {
          const result = await client.send(
            new BatchGetCommand({
              RequestItems: { [table]: { Keys: pending } },
            }),
          );
          items.push(...((result.Responses?.[table] ?? []) as T[]));
          pending = result.UnprocessedKeys?.[table]?.Keys as IKey[] | undefined;
        }
        if (pending?.length) {
          throw new Error('batch get left unprocessed keys');
        }
      }
      return items;
    } catch (error) {
      return wrap('DynamoService.batchGet', error);
    }
  }

  async transactWrite(items: ITransactItem[]): Promise<void> {
    try {
      await client.send(
        new TransactWriteCommand({
          TransactItems: items.map((item) => {
            if ('put' in item) {
              return {
                Put: {
                  TableName: item.put.table,
                  Item: item.put.item,
                  ...conditionInput(item.put),
                },
              };
            }
            if ('update' in item) {
              const update = aliasNames(item.update.expression);
              const condition = conditionInput(item.update);
              return {
                Update: {
                  TableName: item.update.table,
                  Key: item.update.key,
                  UpdateExpression: update.expression,
                  ExpressionAttributeNames: nonEmpty({
                    ...update.names,
                    ...condition.ExpressionAttributeNames,
                  }),
                  ...(item.update.values && {
                    ExpressionAttributeValues: item.update.values,
                  }),
                  ...(condition.ConditionExpression && {
                    ConditionExpression: condition.ConditionExpression,
                  }),
                },
              };
            }
            if ('delete' in item) {
              return {
                Delete: {
                  TableName: item.delete.table,
                  Key: item.delete.key,
                  ...conditionInput(item.delete),
                },
              };
            }
            const check = conditionInput(item.conditionCheck);
            return {
              ConditionCheck: {
                TableName: item.conditionCheck.table,
                Key: item.conditionCheck.key,
                ConditionExpression: check.ConditionExpression ?? '',
                ExpressionAttributeNames: check.ExpressionAttributeNames,
                ...(item.conditionCheck.values && {
                  ExpressionAttributeValues: item.conditionCheck.values,
                }),
              },
            };
          }),
        }),
      );
    } catch (error) {
      return wrap('DynamoService.transactWrite', error);
    }
  }
}

export const dynamoService = new DynamoService();

/******************************************************************************
                              DynamoTable
******************************************************************************/

export type ITableQuery = Omit<IQueryParams, 'table'>;

/** One table and its item type, bound once per repository. */
export class DynamoTable<TItem extends object> {
  readonly name: string;

  constructor(table: TableName) {
    this.name = `${EnvVars.TablePrefix}${table}`;
  }

  get(
    key: IKey,
    options?: { consistent?: boolean },
  ): Promise<TItem | undefined> {
    return dynamoService.get<TItem>(this.name, key, options);
  }

  put(item: TItem, options?: IConditionOptions): Promise<void> {
    return dynamoService.put(this.name, { ...item } as IValues, options);
  }

  update(
    key: IKey,
    expression: string,
    options?: IConditionOptions,
  ): Promise<TItem | undefined> {
    return dynamoService.update<TItem>(this.name, key, expression, options);
  }

  /** Sets each defined field, removes each null one, and stamps `updated_at`. */
  updateFields(
    key: IKey,
    fields: object,
    options?: IConditionOptions,
  ): Promise<TItem | undefined> {
    const sets: string[] = ['updated_at = :updated_at'];
    const removes: string[] = [];
    const values: IValues = { ...options?.values, ':updated_at': nowUtc() };

    for (const [field, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value === null) {
        removes.push(field);
      } else {
        sets.push(`${field} = :${field}`);
        values[`:${field}`] = value;
      }
    }

    const expression =
      `SET ${sets.join(', ')}` +
      (removes.length ? ` REMOVE ${removes.join(', ')}` : '');
    return this.update(key, expression, { ...options, values });
  }

  delete(key: IKey, options?: IConditionOptions): Promise<void> {
    return dynamoService.delete(this.name, key, options);
  }

  query(params: ITableQuery): Promise<IQueryResult<TItem>> {
    return dynamoService.query<TItem>({ ...params, table: this.name });
  }

  queryAll(params: ITableQuery): Promise<TItem[]> {
    return dynamoService.queryAll<TItem>({ ...params, table: this.name });
  }

  scanAll(): Promise<TItem[]> {
    return dynamoService.scanAll<TItem>(this.name);
  }

  batchGet(keys: IKey[]): Promise<TItem[]> {
    return keys.length
      ? dynamoService.batchGet<TItem>(this.name, keys)
      : Promise.resolve([]);
  }

  putItem(item: TItem, options?: IConditionOptions): ITransactItem {
    return {
      put: { table: this.name, item: { ...item } as IValues, ...options },
    };
  }

  updateItem(
    key: IKey,
    expression: string,
    options?: IConditionOptions,
  ): ITransactItem {
    return { update: { table: this.name, key, expression, ...options } };
  }

  deleteItem(key: IKey, options?: IConditionOptions): ITransactItem {
    return { delete: { table: this.name, key, ...options } };
  }
}

export default dynamoService;
