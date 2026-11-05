import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import {
  DynamoConditionFailedError,
  DynamoServiceError,
} from '@src/models/errors/dynamo.error';
import dynamoService, { aliasNames } from '@src/services/dynamo.service';

const ddb = mockClient(DynamoDBDocumentClient);

const failure = (name: string, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(name), { name, ...extra });

beforeEach(() => ddb.reset());

describe('aliasNames', () => {
  it('aliases reserved words and plain attributes', () => {
    expect(aliasNames('name = :n AND status = :s')).toEqual({
      expression: '#name = :n AND #status = :s',
      names: { '#name': 'name', '#status': 'status' },
    });
  });

  it('leaves values, function names, keywords and existing aliases alone', () => {
    const { expression, names } = aliasNames(
      'SET updated_at = :u ADD count :one REMOVE #old',
    );

    expect(expression).toBe('SET #updated_at = :u ADD #count :one REMOVE #old');
    expect(names).toEqual({ '#updated_at': 'updated_at', '#count': 'count' });
  });

  it('aliases the argument of a function but not the function', () => {
    expect(aliasNames('attribute_not_exists(id)')).toEqual({
      expression: 'attribute_not_exists(#id)',
      names: { '#id': 'id' },
    });
    expect(aliasNames('begins_with(activity, :p)').expression).toBe(
      'begins_with(#activity, :p)',
    );
  });
});

describe('DynamoService single-item calls', () => {
  it('get requests a consistent read when asked', async () => {
    ddb.on(GetCommand).resolves({ Item: { id: 'u1' } });

    const item = await dynamoService.get('Users', { id: 'u1' }, { consistent: true });

    expect(item).toEqual({ id: 'u1' });
    expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({
      TableName: 'Users',
      Key: { id: 'u1' },
      ConsistentRead: true,
    });
  });

  it('get returns undefined for a missing item', async () => {
    ddb.on(GetCommand).resolves({});

    expect(await dynamoService.get('Users', { id: 'nope' })).toBeUndefined();
  });

  it('put sends an aliased condition expression', async () => {
    ddb.on(PutCommand).resolves({});

    await dynamoService.put('Users', { id: 'u1' }, { condition: 'attribute_not_exists(id)' });

    expect(ddb.commandCalls(PutCommand)[0].args[0].input).toMatchObject({
      ConditionExpression: 'attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id' },
    });
  });

  it('put without a condition sends no expression attributes', async () => {
    ddb.on(PutCommand).resolves({});

    await dynamoService.put('Users', { id: 'u1' });

    const input = ddb.commandCalls(PutCommand)[0].args[0].input;
    expect(input.ConditionExpression).toBeUndefined();
    expect(input.ExpressionAttributeNames).toBeUndefined();
  });

  it('update aliases the expression and returns the new item', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: { id: 'u1', name: 'Ann' } });

    const result = await dynamoService.update(
      'Users',
      { id: 'u1' },
      'SET name = :n, status = :s',
      { values: { ':n': 'Ann', ':s': 'active' }, condition: 'attribute_exists(id)' },
    );

    expect(result).toEqual({ id: 'u1', name: 'Ann' });
    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({
      UpdateExpression: 'SET #name = :n, #status = :s',
      ConditionExpression: 'attribute_exists(#id)',
      ExpressionAttributeNames: { '#name': 'name', '#status': 'status', '#id': 'id' },
      ReturnValues: 'ALL_NEW',
    });
  });

  it('delete sends the key', async () => {
    ddb.on(DeleteCommand).resolves({});

    await dynamoService.delete('Users', { id: 'u1' });

    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input).toMatchObject({
      Key: { id: 'u1' },
    });
  });
});

describe('DynamoService.query and queryAll', () => {
  it('query aliases key and filter names and reports the last key', async () => {
    ddb.on(QueryCommand).resolves({ Items: [{ id: 'a' }], LastEvaluatedKey: { id: 'a' }, Count: 1 });

    const page = await dynamoService.query({
      table: 'Users',
      index: 'byGroup',
      keyCondition: 'group_id = :g AND status = :s',
      values: { ':g': 'g1', ':s': 'active' },
      filter: 'role = :r',
      descending: true,
    });

    expect(page).toEqual({ items: [{ id: 'a' }], lastKey: { id: 'a' }, count: 1 });
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({
      IndexName: 'byGroup',
      KeyConditionExpression: '#group_id = :g AND #status = :s',
      FilterExpression: '#role = :r',
      ScanIndexForward: false,
    });
  });

  it('queryAll follows pagination to the end', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ id: '1' }], LastEvaluatedKey: { id: '1' } })
      .resolvesOnce({ Items: [{ id: '2' }] });

    const items = await dynamoService.queryAll({
      table: 'Users',
      keyCondition: 'id = :i',
      values: { ':i': 'x' },
    });

    expect(items).toEqual([{ id: '1' }, { id: '2' }]);
    expect(ddb.commandCalls(QueryCommand)[1].args[0].input.ExclusiveStartKey).toEqual({
      id: '1',
    });
  });

  it('queryAll stops at the limit and trims the result', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ id: '1' }, { id: '2' }, { id: '3' }],
      LastEvaluatedKey: { id: '3' },
    });

    const items = await dynamoService.queryAll({
      table: 'Users',
      keyCondition: 'id = :i',
      values: { ':i': 'x' },
      limit: 2,
    });

    expect(items).toHaveLength(2);
    expect(ddb.commandCalls(QueryCommand)).toHaveLength(1);
  });
});

describe('DynamoService.batchGet', () => {
  it('splits keys into calls of at most 100', async () => {
    ddb.on(BatchGetCommand).resolves({ Responses: { Users: [] } });
    const keys = Array.from({ length: 250 }, (_, i) => ({ id: `u${i}` }));

    await dynamoService.batchGet('Users', keys);

    const sizes = ddb
      .commandCalls(BatchGetCommand)
      .map((call) => call.args[0].input.RequestItems?.Users.Keys?.length);
    expect(sizes).toEqual([100, 100, 50]);
  });

  it('retries unprocessed keys and returns every item', async () => {
    ddb
      .on(BatchGetCommand)
      .resolvesOnce({
        Responses: { Users: [{ id: 'a' }] },
        UnprocessedKeys: { Users: { Keys: [{ id: 'b' }] } },
      })
      .resolvesOnce({ Responses: { Users: [{ id: 'b' }] } });

    const items = await dynamoService.batchGet('Users', [{ id: 'a' }, { id: 'b' }]);

    expect(items).toEqual([{ id: 'a' }, { id: 'b' }]);
  });
});

describe('DynamoService.transactWrite', () => {
  it('sends put, update and condition-check items with aliased expressions', async () => {
    ddb.on(TransactWriteCommand).resolves({});

    await dynamoService.transactWrite([
      { put: { table: 'Guards', item: { subject_id: 's' }, condition: 'attribute_not_exists(subject_id)' } },
      { update: { table: 'Totals', key: { user_id: 'u' }, expression: 'ADD points :p', values: { ':p': 5 } } },
      { conditionCheck: { table: 'Users', key: { id: 'u' }, condition: 'status = :a', values: { ':a': 'active' } } },
    ]);

    const items = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(items[0].Put?.ConditionExpression).toBe('attribute_not_exists(#subject_id)');
    expect(items[1].Update?.UpdateExpression).toBe('ADD #points :p');
    expect(items[2].ConditionCheck?.ConditionExpression).toBe('#status = :a');
  });
});

describe('DynamoService errors', () => {
  it('maps a failed condition to DynamoConditionFailedError', async () => {
    ddb.on(PutCommand).rejects(failure('ConditionalCheckFailedException'));

    await expect(dynamoService.put('Users', { id: 'u1' })).rejects.toBeInstanceOf(
      DynamoConditionFailedError,
    );
  });

  it('maps a transaction cancelled by a condition to DynamoConditionFailedError', async () => {
    ddb.on(TransactWriteCommand).rejects(
      failure('TransactionCanceledException', {
        CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
      }),
    );

    await expect(
      dynamoService.transactWrite([{ delete: { table: 'T', key: { id: '1' } } }]),
    ).rejects.toBeInstanceOf(DynamoConditionFailedError);
  });

  it('wraps any other failure in DynamoServiceError with the cause', async () => {
    const original = failure('ProvisionedThroughputExceededException');
    ddb.on(GetCommand).rejects(original);

    const error = (await dynamoService
      .get('Users', { id: 'u1' })
      .catch((e: unknown) => e)) as DynamoServiceError;

    expect(error).toBeInstanceOf(DynamoServiceError);
    expect(error.cause).toBe(original);
  });
});
