import '../../helpers/setEnv';

import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import groupTrainerRepository from '@src/repositories/groupTrainer.repository';

const ddb = mockClient(DynamoDBDocumentClient);

beforeEach(() => ddb.reset());

describe('GroupTrainerRepository', () => {
  it('findGroupTrainersByGroupId returns the trainers of one group', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [{ group_id: 'g1', trainer_id: 't1', created_at: 'x' }],
    });

    expect(await groupTrainerRepository.findGroupTrainersByGroupId('g1')).toEqual([
      { group_id: 'g1', trainer_id: 't1' },
    ]);
  });

  it('insertGroupTrainers writes one item per row', async () => {
    ddb.on(PutCommand).resolves({});

    await groupTrainerRepository.insertGroupTrainers([
      { group_id: 'g1', trainer_id: 't1' },
      { group_id: 'g1', trainer_id: 't2' },
    ]);

    const items = ddb.commandCalls(PutCommand).map((c) => c.args[0].input.Item);
    expect(items).toEqual([
      expect.objectContaining({ group_id: 'g1', trainer_id: 't1' }),
      expect.objectContaining({ group_id: 'g1', trainer_id: 't2' }),
    ]);
  });

  it('deleteGroupTrainersByGroupId deletes every trainer of the group', async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        { group_id: 'g1', trainer_id: 't1' },
        { group_id: 'g1', trainer_id: 't2' },
      ],
    });
    ddb.on(DeleteCommand).resolves({});

    await groupTrainerRepository.deleteGroupTrainersByGroupId('g1');

    const keys = ddb.commandCalls(DeleteCommand).map((c) => c.args[0].input.Key);
    expect(keys).toEqual([
      { group_id: 'g1', trainer_id: 't1' },
      { group_id: 'g1', trainer_id: 't2' },
    ]);
  });

  it('findGroupIdsByTrainerIds maps each trainer to their groups and omits trainers with none', async () => {
    ddb
      .on(QueryCommand)
      .resolvesOnce({ Items: [{ group_id: 'g1', trainer_id: 't1' }, { group_id: 'g2', trainer_id: 't1' }] })
      .resolvesOnce({ Items: [] });

    const map = await groupTrainerRepository.findGroupIdsByTrainerIds(['t1', 't2', 't1']);

    expect(Array.from(map.entries())).toEqual([['t1', ['g1', 'g2']]]);
    expect(ddb.commandCalls(QueryCommand)[0].args[0].input.IndexName).toBe('byTrainer');
  });
});
