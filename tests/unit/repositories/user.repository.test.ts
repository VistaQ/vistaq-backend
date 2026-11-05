import '../../helpers/setEnv';

import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import {
  UserAlreadyExistsError,
  UserNotFoundError,
} from '@src/models/errors/auth.errors';
import { RepositoryError } from '@src/models/errors/layer.errors';
import userRepository from '@src/repositories/user.repository';

const ddb = mockClient(DynamoDBDocumentClient);

const item = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  email: 'ann@example.com',
  name: 'Ann',
  role: 'agent',
  status: 'active',
  group_id: 'g1',
  agent_code: 'A100',
  created_at: '2026-11-04T00:00:00.000Z',
  updated_at: '2026-11-04T00:00:00.000Z',
  ...overrides,
});

const conditionFailure = Object.assign(new Error('x'), {
  name: 'ConditionalCheckFailedException',
});

beforeEach(() => ddb.reset());

describe('UserRepository.insertUser', () => {
  it('writes a lowercased email, omits empty optional fields and refuses to overwrite', async () => {
    ddb.on(PutCommand).resolves({});

    const user = await userRepository.insertUser({
      id: 'u1',
      email: 'Ann@Example.com',
      name: 'Ann',
      role: 'agent',
      group_id: 'g1',
      phone: null,
      location: undefined,
    });

    const input = ddb.commandCalls(PutCommand)[0].args[0].input;
    expect(input.TableName).toBe('users-table');
    expect(input.ConditionExpression).toBe('attribute_not_exists(#id)');
    expect(input.Item).toMatchObject({ id: 'u1', email: 'ann@example.com', group_id: 'g1', status: 'active' });
    expect(input.Item).not.toHaveProperty('phone');
    expect(input.Item).not.toHaveProperty('location');
    expect(user).toMatchObject({ id: 'u1', phone: null, location: null, group_id: 'g1' });
  });

  it('throws UserAlreadyExistsError when the id is taken', async () => {
    ddb.on(PutCommand).rejects(conditionFailure);

    await expect(
      userRepository.insertUser({ id: 'u1', email: 'a@b.co', name: 'A', role: 'agent' }),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });
});

describe('UserRepository reads', () => {
  it('findById maps the item and passes the consistent flag', async () => {
    ddb.on(GetCommand).resolves({ Item: item() });

    const user = await userRepository.findById('u1', { consistent: true });

    expect(ddb.commandCalls(GetCommand)[0].args[0].input).toMatchObject({
      Key: { id: 'u1' },
      ConsistentRead: true,
    });
    expect(user).toMatchObject({ id: 'u1', name: 'Ann', agent_code: 'A100', fyct_target: null });
  });

  it('findById returns null for a missing user', async () => {
    ddb.on(GetCommand).resolves({});

    expect(await userRepository.findById('nope')).toBeNull();
  });

  it('findByIds removes duplicates before the batch get', async () => {
    ddb.on(BatchGetCommand).resolves({ Responses: { 'users-table': [item()] } });

    const users = await userRepository.findByIds(['u1', 'u1']);

    const keys = ddb.commandCalls(BatchGetCommand)[0].args[0].input.RequestItems!['users-table'].Keys;
    expect(keys).toEqual([{ id: 'u1' }]);
    expect(users).toHaveLength(1);
  });

  it('findByGroupId queries the active members of the group by default', async () => {
    ddb.on(QueryCommand).resolves({ Items: [item()] });

    await userRepository.findByGroupId('g1');

    expect(ddb.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({
      IndexName: 'byGroup',
      KeyConditionExpression: '#group_id = :group AND #status = :status',
      ExpressionAttributeValues: { ':group': 'g1', ':status': 'active' },
    });
  });

  it('findByGroupId with a null status queries every member', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await userRepository.findByGroupId('g1', null);

    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.KeyConditionExpression).toBe(
      '#group_id = :group',
    );
  });

  it('findByRoles runs one query per role and merges the results', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [item({ id: 'a' })] })
      .resolvesOnce({ Items: [item({ id: 'b' })] });

    const users = await userRepository.findByRoles(['admin', 'agent'], 'active');

    expect(users.map((u) => u.id).sort()).toEqual(['a', 'b']);
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({
      IndexName: 'byRoleStatus',
      KeyConditionExpression: '#role = :role AND #status = :status',
    });
  });

  it('findByAgentCodes returns only active holders of the codes', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [item({ id: 'a', agent_code: 'A1' })] })
      .resolvesOnce({ Items: [item({ id: 'b', agent_code: 'B2', status: 'inactive' })] });

    const result = await userRepository.findByAgentCodes(['A1', 'B2']);

    expect(result).toEqual([{ id: 'a', agent_code: 'A1' }]);
  });

  it('findIdNameAgentCodeByIds filters to the permitted groups and short-circuits an empty scope', async () => {
    ddb.on(BatchGetCommand).resolves({
      Responses: { 'users-table': [item({ id: 'a', group_id: 'g1' }), item({ id: 'b', group_id: 'g2' })] },
    });

    const inScope = await userRepository.findIdNameAgentCodeByIds(['a', 'b'], ['g1']);
    const noScope = await userRepository.findIdNameAgentCodeByIds(['a'], []);

    expect(inScope.map((u) => u.id)).toEqual(['a']);
    expect(noScope).toEqual([]);
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(1);
  });
});

describe('UserRepository.updateUser', () => {
  it('sets provided fields, removes nulls and lowercases the email', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: item({ group_id: undefined }) });

    await userRepository.updateUser('u1', { email: 'New@Example.com', name: 'Ann B', group_id: null });

    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.UpdateExpression).toBe(
      'SET #updated_at = :updated_at, #email = :email, #name = :name REMOVE #group_id',
    );
    expect(input.ExpressionAttributeValues).toMatchObject({ ':email': 'new@example.com', ':name': 'Ann B' });
    expect(input.ConditionExpression).toBe('attribute_exists(#id)');
  });

  it('throws UserNotFoundError when the user does not exist', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailure);

    await expect(userRepository.updateUser('nope', { name: 'x' })).rejects.toBeInstanceOf(
      UserNotFoundError,
    );
  });

  it('wraps other failures in RepositoryError', async () => {
    ddb.on(UpdateCommand).rejects(new Error('throttled'));

    await expect(userRepository.updateUser('u1', { name: 'x' })).rejects.toBeInstanceOf(
      RepositoryError,
    );
  });
});

describe('UserRepository.updateGroupIdForUsers and deleteUser', () => {
  it('updates each user, removing the group when null', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: item() });

    await userRepository.updateGroupIdForUsers(['u1', 'u2'], null);

    const calls = ddb.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(2);
    expect(calls[0].args[0].input.UpdateExpression).toContain('REMOVE #group_id');
  });

  it('deleteUser deletes by id', async () => {
    ddb.on(DeleteCommand).resolves({});

    await userRepository.deleteUser('u1');

    expect(ddb.commandCalls(DeleteCommand)[0].args[0].input.Key).toEqual({ id: 'u1' });
  });
});
