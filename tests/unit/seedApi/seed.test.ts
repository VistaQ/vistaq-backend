import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminCreateUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { retryOnStatus, seedStage } from '../../../scripts/seed-api/seed';
import type { IStage } from '../../../scripts/seed-api/stage';

const cognito = mockClient(CognitoIdentityProviderClient);
const region = 'ap-southeast-5';
const fetch = vi.fn<(request: Request) => Promise<Response>>();

const stage = {
  name: 'staging',
  region,
  apiUrl: 'https://api.test/api',
  userPoolId: 'pool-1',
  clientId: 'client-1',
  tablePrefix: 'test_vistaq_',
  tables: { Users: 'test_vistaq_Users' },
  queues: {},
} as unknown as IStage;

const clients = () => ({
  cognito: new CognitoIdentityProviderClient({ region }),
  dynamo: DynamoDBDocumentClient.from(new DynamoDBClient({ region })),
  sqs: new SQSClient({ region }),
  fetch,
});

const poolUser = (email: string) => ({
  Username: email,
  Attributes: [
    { Name: 'email', Value: email },
    { Name: 'sub', Value: '0b6f3c2e-1d4a-4c57-9f0e-6a2b8d9e7c10' },
  ],
});

let dir: string;
let recordPath: string;

beforeEach(() => {
  cognito.reset();
  fetch.mockReset();
  dir = mkdtempSync(join(tmpdir(), 'seed-api-'));
  recordPath = join(dir, 'staging.json');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('seedStage', () => {
  it('stops before any create call when seed users exist, naming reset', async () => {
    cognito
      .on(ListUsersCommand)
      .resolves({ Users: [poolUser('seed-agent-01@example.com')] });

    await expect(seedStage(stage, clients(), { recordPath })).rejects.toThrow(
      'npm run seed:api:reset -- --stage staging',
    );

    expect(
      cognito.commandCalls(ListUsersCommand)[0].args[0].input.Filter,
    ).toBe('email ^= "seed-"');
    expect(cognito.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    expect(existsSync(recordPath)).toBe(false);
  });

  it('stops when an earlier run left its record', async () => {
    cognito.on(ListUsersCommand).resolves({ Users: [] });
    writeFileSync(recordPath, '{}');

    await expect(seedStage(stage, clients(), { recordPath })).rejects.toThrow(
      /run record/,
    );
    expect(cognito.commandCalls(AdminCreateUserCommand)).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('goes ahead when the filter matches only addresses that are not seed users', async () => {
    cognito
      .on(ListUsersCommand)
      .resolves({ Users: [poolUser('seed-fan@gmail.com')] });
    cognito.on(AdminCreateUserCommand).rejects(new Error('stop here'));

    await expect(seedStage(stage, clients(), { recordPath })).rejects.toThrow(
      'stop here',
    );
    expect(cognito.commandCalls(AdminCreateUserCommand)).toHaveLength(1);
  });
});

describe('retryOnStatus', () => {
  const responding = (...statuses: number[]) => {
    const send = vi.fn(async () => ({
      response: new Response(null, { status: statuses.shift() ?? 200 }),
    }));
    return send;
  };

  it('sends again while the status repeats, then returns the next answer', async () => {
    const send = responding(409, 409, 200);

    const result = await retryOnStatus(send, 409, { baseDelayMs: 0 });

    expect(result.response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt and leaves other statuses alone', async () => {
    const conflicts = responding(409, 409, 409, 409, 409);
    const result = await retryOnStatus(conflicts, 409, { baseDelayMs: 0 });
    expect(result.response.status).toBe(409);
    expect(conflicts).toHaveBeenCalledTimes(4);

    const invalid = responding(400);
    await retryOnStatus(invalid, 409, { baseDelayMs: 0 });
    expect(invalid).toHaveBeenCalledTimes(1);
  });
});
