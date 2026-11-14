import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { SEED_ADMIN_EMAIL, SeedAuth } from '../../../scripts/seed-api/auth';
import type { IStage } from '../../../scripts/seed-api/stage';

const cognito = mockClient(CognitoIdentityProviderClient);
const ddb = mockClient(DynamoDBDocumentClient);

const stage = {
  name: 'staging',
  region: 'ap-southeast-5',
  apiUrl: 'https://api.test/api',
  userPoolId: 'pool-1',
  clientId: 'client-1',
  tablePrefix: 'test_vistaq_',
  tables: { Users: 'test_vistaq_Users' },
} as unknown as IStage;

const auth = () =>
  new SeedAuth(
    stage,
    new CognitoIdentityProviderClient({ region: 'ap-southeast-5' }),
    DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'ap-southeast-5' })),
  );

const passwordsSet = () =>
  cognito
    .commandCalls(AdminSetUserPasswordCommand)
    .map((call) => call.args[0].input);

beforeEach(() => {
  cognito.reset();
  ddb.reset();
  cognito.on(AdminSetUserPasswordCommand).resolves({});
  cognito
    .on(InitiateAuthCommand)
    .resolves({ AuthenticationResult: { AccessToken: 'access' } });
});

afterEach(() => vi.restoreAllMocks());

describe('SeedAuth.createSeedAdmin', () => {
  it('creates the Cognito user without an email and writes an admin item with its sub', async () => {
    cognito.on(AdminCreateUserCommand).resolves({
      User: { Attributes: [{ Name: 'sub', Value: 'sub-admin' }] },
    });
    ddb.on(PutCommand).resolves({});

    const id = await auth().createSeedAdmin();

    expect(id).toBe('sub-admin');
    expect(
      cognito.commandCalls(AdminCreateUserCommand)[0].args[0].input,
    ).toMatchObject({
      UserPoolId: 'pool-1',
      Username: SEED_ADMIN_EMAIL,
      MessageAction: 'SUPPRESS',
      UserAttributes: expect.arrayContaining([
        { Name: 'email_verified', Value: 'true' },
      ]),
    });
    expect(ddb.commandCalls(PutCommand)[0].args[0].input).toMatchObject({
      TableName: 'test_vistaq_Users',
      Item: { id: 'sub-admin', role: 'admin', status: 'active' },
      ConditionExpression: 'attribute_not_exists(id)',
    });
    expect(passwordsSet()).toEqual([
      expect.objectContaining({ Username: SEED_ADMIN_EMAIL, Permanent: true }),
    ]);
  });
});

describe('SeedAuth.tokenFor', () => {
  it('sets the run password once, signs in with PASSWORD and reuses the token', async () => {
    const token = auth().tokenFor('seed-agent-01@example.com');

    expect(await token(false)).toBe('access');
    expect(await token(false)).toBe('access');

    expect(passwordsSet()).toHaveLength(1);
    expect(cognito.commandCalls(InitiateAuthCommand)).toHaveLength(1);
    expect(
      cognito.commandCalls(InitiateAuthCommand)[0].args[0].input,
    ).toMatchObject({
      AuthFlow: 'USER_AUTH',
      ClientId: 'client-1',
      AuthParameters: {
        USERNAME: 'seed-agent-01@example.com',
        PREFERRED_CHALLENGE: 'PASSWORD',
        PASSWORD: passwordsSet()[0].Password,
      },
    });
  });

  it('signs in again on refresh without resetting the password', async () => {
    const token = auth().tokenFor('seed-agent-01@example.com');

    await token(false);
    await token(true);

    expect(cognito.commandCalls(InitiateAuthCommand)).toHaveLength(2);
    expect(passwordsSet()).toHaveLength(1);
  });
});

describe('SeedAuth.run', () => {
  it('re-randomises every signed-in user after the work succeeds', async () => {
    const seed = auth();

    await seed.run(async () => {
      await seed.tokenFor('a@example.com')(false);
      await seed.tokenFor('b@example.com')(false);
    });

    const calls = passwordsSet();
    const runPassword = calls[0].Password;
    const restored = calls.slice(2);
    expect(restored.map((c) => c.Username).sort()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
    for (const call of restored) {
      expect(call.Password).not.toBe(runPassword);
      expect(call.Permanent).toBe(true);
    }
    expect(restored[0].Password).not.toBe(restored[1].Password);
  });

  it('still re-randomises every signed-in user when the work throws, and rethrows', async () => {
    const seed = auth();

    await expect(
      seed.run(async () => {
        await seed.tokenFor('a@example.com')(false);
        await seed.tokenFor('b@example.com')(false);
        throw new Error('seed failed part way');
      }),
    ).rejects.toThrow('seed failed part way');

    const restored = passwordsSet().slice(2);
    expect(restored.map((c) => c.Username).sort()).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('restores a user whose sign-in failed after the password was set', async () => {
    const seed = auth();
    cognito.on(InitiateAuthCommand).rejects(new Error('throttled'));

    await expect(
      seed.run(() => seed.tokenFor('a@example.com')(false)),
    ).rejects.toThrow('throttled');

    expect(passwordsSet().map((c) => c.Username)).toEqual([
      'a@example.com',
      'a@example.com',
    ]);
  });

  it('restores passwords and exits on Ctrl+C', async () => {
    const seed = auth();
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    const once = vi.spyOn(process, 'once');
    let interrupt!: () => void;
    const stopped = new Promise<void>((resolve) => (interrupt = resolve));

    const running = seed.run(async () => {
      await seed.tokenFor('a@example.com')(false);
      const handler = once.mock.calls.find(([event]) => event === 'SIGINT');
      (handler![1] as () => void)();
      await stopped;
    });

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130));
    expect(passwordsSet().map((c) => c.Username)).toEqual([
      'a@example.com',
      'a@example.com',
    ]);
    interrupt();
    await running;
  });
});
