import '../../helpers/setEnv';

import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import {
  AgentCodeConflictError,
  AgentCodeNotFoundError,
} from '@src/models/errors/agentCode.errors';
import { AgentCodeInvalidError } from '@src/models/errors/auth.errors';
import agentCodeRepository from '@src/repositories/agentCode.repository';

const ddb = mockClient(DynamoDBDocumentClient);

const row = (agent_code: string, used_flag: 0 | 1 = 0, extra = {}) => ({
  agent_code,
  used_flag,
  created_at: '2026-11-04T00:00:00.000Z',
  updated_at: '2026-11-04T00:00:00.000Z',
  ...extra,
});

const conditionFailure = Object.assign(new Error('x'), {
  name: 'ConditionalCheckFailedException',
});

beforeEach(() => ddb.reset());

describe('AgentCodeRepository.findAll', () => {
  it('queries both used flags when no filter is given', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [row('A1', 0)] })
      .resolvesOnce({ Items: [row('B2', 1, { user_id: 'u1' })] });

    const codes = await agentCodeRepository.findAll();

    expect(codes.map((c) => [c.agent_code, c.is_used, c.user_id])).toEqual([
      ['A1', false, null],
      ['B2', true, 'u1'],
    ]);
  });

  it('queries only the requested flag', async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });

    await agentCodeRepository.findAll({ is_used: true });

    const calls = ddb.commandCalls(QueryCommand);
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0].input.ExpressionAttributeValues).toEqual({ ':flag': 1 });
  });
});

describe('AgentCodeRepository writes', () => {
  it('createMany creates a missing code as unused and leaves an existing one alone', async () => {
    ddb.on(UpdateCommand).resolves({ Attributes: row('A1') });

    await agentCodeRepository.createMany(['A1']);

    const input = ddb.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.UpdateExpression).toContain('if_not_exists(#used_flag, :unused)');
    expect(input.UpdateExpression).toContain('if_not_exists(#created_at, :now)');
  });

  it('claim only succeeds for an existing unused code', async () => {
    ddb.on(UpdateCommand).resolves({});

    await agentCodeRepository.claim('A1', 'u1');

    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({
      ConditionExpression: 'attribute_exists(#agent_code) AND #used_flag = :unused',
      ExpressionAttributeValues: expect.objectContaining({ ':used': 1, ':unused': 0, ':user': 'u1' }),
    });
  });

  it('claim throws AgentCodeInvalidError when the code is missing or already used', async () => {
    ddb.on(UpdateCommand).rejects(conditionFailure);

    await expect(agentCodeRepository.claim('A1', 'u1')).rejects.toBeInstanceOf(
      AgentCodeInvalidError,
    );
  });

  it('release marks the code unused and clears the user', async () => {
    ddb.on(UpdateCommand).resolves({});

    await agentCodeRepository.release('A1');

    expect(ddb.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).toBe(
      'SET #used_flag = :unused, #updated_at = :now REMOVE #user_id',
    );
  });

  it('deleteByCode throws AgentCodeNotFoundError for an unknown code', async () => {
    ddb.on(DeleteCommand).rejects(conditionFailure);

    await expect(agentCodeRepository.deleteByCode('A1')).rejects.toBeInstanceOf(
      AgentCodeNotFoundError,
    );
  });
});

describe('AgentCodeRepository.rename', () => {
  it('deletes the old code and writes the new one in one transaction', async () => {
    ddb.on(GetCommand).resolves({ Item: row('A1', 1, { user_id: 'u1' }) });
    ddb.on(TransactWriteCommand).resolves({});

    const renamed = await agentCodeRepository.rename('A1', 'A2');

    const items = ddb.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(items[0].Delete?.Key).toEqual({ agent_code: 'A1' });
    expect(items[1].Put?.Item).toMatchObject({ agent_code: 'A2', used_flag: 1, user_id: 'u1' });
    expect(renamed).toMatchObject({ agent_code: 'A2', is_used: true });
  });

  it('throws AgentCodeNotFoundError when the code does not exist', async () => {
    ddb.on(GetCommand).resolves({});

    await expect(agentCodeRepository.rename('A1', 'A2')).rejects.toBeInstanceOf(
      AgentCodeNotFoundError,
    );
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('throws AgentCodeConflictError when the new code already exists', async () => {
    ddb.on(GetCommand).resolves({ Item: row('A1') });
    ddb.on(TransactWriteCommand).rejects(
      Object.assign(new Error('x'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
      }),
    );

    await expect(agentCodeRepository.rename('A1', 'A2')).rejects.toBeInstanceOf(
      AgentCodeConflictError,
    );
  });
});
