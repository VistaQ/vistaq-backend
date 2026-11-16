import { beforeEach, describe, expect, it } from 'vitest';

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { TABLE_NAMES } from '@src/constants/tables';

import {
  describeDiff,
  diffSnapshots,
  takeSnapshot,
} from '../../../scripts/seed-api/snapshot';
import type { IStage } from '../../../scripts/seed-api/stage';

const cognito = mockClient(CognitoIdentityProviderClient);
const dynamo = mockClient(DynamoDBDocumentClient);
const region = 'ap-southeast-5';

const stage = {
  name: 'dev',
  region,
  userPoolId: 'pool-1',
  tables: Object.fromEntries(TABLE_NAMES.map((t) => [t, `test_${t}`])),
} as unknown as IStage;

const clients = () => ({
  cognito: new CognitoIdentityProviderClient({ region }),
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({ region })),
});

const holding = (users: object[], usernames: string[]) => {
  dynamo.reset();
  cognito.reset();
  dynamo.on(DescribeTableCommand).resolves({
    Table: {
      KeySchema: [
        { AttributeName: 'ym', KeyType: 'RANGE' },
        { AttributeName: 'id', KeyType: 'HASH' },
      ],
    },
  });
  dynamo.on(ScanCommand).resolves({ Items: [] });
  dynamo.on(ScanCommand, { TableName: 'test_Users' }).resolves({ Items: users });
  cognito
    .on(ListUsersCommand)
    .resolves({ Users: usernames.map((Username) => ({ Username })) });
};

const admin = { id: 'u1', ym: 'x', name: 'Admin', tags: new Set(['b', 'a']) };

beforeEach(() => holding([admin], ['owner']));

describe('snapshot', () => {
  it('reports no change when nothing changed since the save', async () => {
    const saved = await takeSnapshot(stage, clients());
    holding([{ ...admin, tags: new Set(['a', 'b']) }], ['owner']);

    const diff = diffSnapshots(saved, await takeSnapshot(stage, clients()));

    expect(diff.unchanged).toBe(true);
    expect(describeDiff(diff)).toEqual(['No change']);
    expect(Object.keys(saved.tables.Users!)).toEqual(['{"id":"u1","ym":"x"}']);
  });

  it('reports added, removed and changed items and pool users', async () => {
    const saved = await takeSnapshot(stage, clients());
    holding(
      [
        { ...admin, name: 'Renamed' },
        { id: 'u2', ym: 'x', name: 'Seed agent' },
      ],
      ['owner', 'seed-agent-01@example.com'],
    );

    const diff = diffSnapshots(saved, await takeSnapshot(stage, clients()));

    expect(diff.unchanged).toBe(false);
    expect(diff.tables.Users).toEqual({
      added: ['{"id":"u2","ym":"x"}'],
      removed: [],
      changed: ['{"id":"u1","ym":"x"}'],
    });
    expect(diff.users).toEqual({
      added: ['seed-agent-01@example.com'],
      removed: [],
    });
  });
});
