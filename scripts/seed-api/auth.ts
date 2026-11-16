import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  paginateListUsers,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes } from 'crypto';

import { nowUtc } from '@src/utils/period';

import type { TokenSource } from './client';
import { SEED_EMAIL } from './plan';
import type { IStage } from './stage';

export const SEED_ADMIN_EMAIL = 'seed-admin@example.com';

export interface ISeedUser {
  username: string;
  email: string;
  sub: string;
}

export async function findSeedUsers(
  stage: IStage,
  cognito: CognitoIdentityProviderClient,
): Promise<ISeedUser[]> {
  const users: ISeedUser[] = [];
  for await (const page of paginateListUsers(
    { client: cognito },
    { UserPoolId: stage.userPoolId, Filter: 'email ^= "seed-"' },
  )) {
    for (const user of page.Users ?? []) {
      const attribute = (name: string) =>
        user.Attributes?.find((a) => a.Name === name)?.Value ?? '';
      const email = attribute('email');
      if (user.Username && SEED_EMAIL.test(email)) {
        users.push({ username: user.Username, email, sub: attribute('sub') });
      }
    }
  }
  return users;
}

// The suffix covers the pool's default policy (upper, lower, digit, symbol).
export const randomPassword = (): string =>
  `${randomBytes(24).toString('base64url')}Aa1!`;

export class SeedAuth {
  private readonly runPassword = randomPassword();
  private readonly tokens = new Map<string, string>();
  private readonly signingIn = new Map<string, Promise<string>>();
  private readonly touched = new Set<string>();
  private closed = false;

  public constructor(
    private readonly stage: IStage,
    private readonly cognito = new CognitoIdentityProviderClient({
      region: stage.region,
    }),
    private readonly dynamo = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: stage.region }),
    ),
  ) {}

  /** No route can create the first admin, so it is written the way create-admin.js does. */
  public async createSeedAdmin(): Promise<string> {
    const created = await this.cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: this.stage.userPoolId,
        Username: SEED_ADMIN_EMAIL,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: SEED_ADMIN_EMAIL },
          { Name: 'email_verified', Value: 'true' },
        ],
      }),
    );
    const id = created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
    if (!id) throw new Error('Cognito returned no sub for the seed admin');

    await this.setPassword(SEED_ADMIN_EMAIL, randomPassword());
    const now = nowUtc();
    await this.dynamo.send(
      new PutCommand({
        TableName: this.stage.tables.Users,
        Item: {
          id,
          email: SEED_ADMIN_EMAIL,
          name: 'Seed Admin',
          role: 'admin',
          status: 'active',
          created_at: now,
          updated_at: now,
        },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
    return id;
  }

  /** Signs in with the run password; `refresh` forces a new sign-in. */
  public tokenFor(email: string): TokenSource {
    return async (refresh) => {
      if (this.closed) {
        throw new Error(`Sign-in for ${email} after the run ended`);
      }
      const cached = this.tokens.get(email);
      if (cached && !refresh) return cached;

      const inFlight = this.signingIn.get(email);
      if (inFlight) return inFlight;
      const signIn = this.signIn(email).finally(() =>
        this.signingIn.delete(email),
      );
      this.signingIn.set(email, signIn);
      return signIn;
    };
  }

  private async signIn(email: string): Promise<string> {
    if (!this.touched.has(email)) {
      this.touched.add(email);
      await this.setPassword(email, this.runPassword);
    }
    const result = await this.cognito.send(
      new InitiateAuthCommand({
        AuthFlow: 'USER_AUTH',
        ClientId: this.stage.clientId,
        AuthParameters: {
          USERNAME: email,
          PREFERRED_CHALLENGE: 'PASSWORD',
          PASSWORD: this.runPassword,
        },
      }),
    );
    const token = result.AuthenticationResult?.AccessToken;
    if (!token) throw new Error(`Sign-in for ${email} returned no token`);
    this.tokens.set(email, token);
    return token;
  }

  /** Ends the run: later sign-ins fail, and any in flight finishes first. */
  public async restorePasswords(): Promise<void> {
    this.closed = true;
    await Promise.allSettled(this.signingIn.values());
    const failures: unknown[] = [];
    for (const email of Array.from(this.touched)) {
      try {
        await this.setPassword(email, randomPassword());
        this.touched.delete(email);
      } catch (error) {
        failures.push(error);
      }
    }
    this.tokens.clear();
    if (failures.length) {
      const first =
        failures[0] instanceof Error ? failures[0].message : failures[0];
      throw new Error(
        `Could not restore ${failures.length} password(s); run reset. First failure: ${String(first)}`,
      );
    }
  }

  /** Runs the work and restores passwords afterwards, on failure and on Ctrl+C too. */
  public async run<T>(work: () => Promise<T>): Promise<T> {
    const onInterrupt = () => {
      void this.restorePasswords().finally(() => process.exit(130));
    };
    process.once('SIGINT', onInterrupt);
    let result: T;
    try {
      result = await work();
    } catch (error) {
      process.removeListener('SIGINT', onInterrupt);
      await this.restorePasswords().catch(() => undefined);
      throw error;
    }
    process.removeListener('SIGINT', onInterrupt);
    await this.restorePasswords();
    return result;
  }

  private async setPassword(email: string, password: string): Promise<void> {
    await this.cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.stage.userPoolId,
        Username: email,
        Password: password,
        Permanent: true,
      }),
    );
  }
}
