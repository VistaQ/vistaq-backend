import { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { existsSync } from 'fs';

import { findSeedUsers, SEED_ADMIN_EMAIL, SeedAuth } from './auth';
import { type ApiClient, createApiClient, createLimiter } from './client';
import { buildPlan } from './plan';
import { describeGrowth, failureDepths } from './queues';
import { RunRecord, runRecordPath } from './record';
import { type IStage, resolveStage, stageFromArgs } from './stage';

export interface ISeedClients {
  cognito: CognitoIdentityProviderClient;
  dynamo: DynamoDBDocumentClient;
  sqs: SQSClient;
  fetch?: (request: Request) => Promise<Response>;
}

export interface ISeedOptions {
  now?: Date;
  recordPath?: string;
  report?: (line: string) => void;
}

export class SeedDataPresentError extends Error {
  public constructor(stage: string, detail: string) {
    super(
      `${stage} already holds seed data (${detail}). Run npm run seed:api:reset -- --stage ${stage} first.`,
    );
    this.name = 'SeedDataPresentError';
  }
}

export const resetCommand = (stage: string): string =>
  `npm run seed:api:reset -- --stage ${stage}`;

export async function assertNoSeedData(
  stage: IStage,
  cognito: CognitoIdentityProviderClient,
  recordPath: string,
): Promise<void> {
  const users = await findSeedUsers(stage, cognito);
  if (users.length) {
    throw new SeedDataPresentError(stage.name, `${users.length} seed users`);
  }
  if (existsSync(recordPath)) {
    throw new SeedDataPresentError(stage.name, `a run record at ${recordPath}`);
  }
}

interface IApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function ok<T>(result: IApiResult<T>, what: string): T {
  if (!result.response.ok || result.data === undefined) {
    throw new Error(
      `${what}: ${result.response.status} ${JSON.stringify(result.error ?? null)}`,
    );
  }
  return result.data;
}

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends again, with backoff, while the response has the given status. */
export async function retryOnStatus<R extends { response: Response }>(
  send: () => Promise<R>,
  status: number,
  { attempts = 4, baseDelayMs = 1_000 } = {},
): Promise<R> {
  let result = await send();
  for (let attempt = 1; attempt < attempts; attempt++) {
    if (result.response.status !== status) break;
    await wait(baseDelayMs * 2 ** (attempt - 1));
    result = await send();
  }
  return result;
}

/** Waits for every task, so no sign-in outlives the password restore. */
async function settleAll<T>(
  items: readonly T[],
  work: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
  const results = await Promise.allSettled(items.map(work));
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : [],
  );
  if (failures.length) {
    throw new Error(
      `${failures.length} of ${items.length} failed; first: ${messageOf(failures[0])}`,
    );
  }
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups];
}

export async function seedStage(
  stage: IStage,
  clients: ISeedClients,
  options: ISeedOptions = {},
): Promise<Record<string, number>> {
  const recordPath = options.recordPath ?? runRecordPath(stage.name);
  await assertNoSeedData(stage, clients.cognito, recordPath);

  const now = options.now ?? new Date();
  const report = options.report ?? (() => undefined);
  const plan = buildPlan(now);
  const record = new RunRecord(recordPath, stage.name, now.toISOString());
  const auth = new SeedAuth(stage, clients.cognito, clients.dynamo);
  const limiter = createLimiter();
  const failuresBefore = await failureDepths(stage, clients.sqs);

  const apis = new Map<string, ApiClient>();
  const as = (email: string): ApiClient => {
    const existing = apis.get(email);
    if (existing) return existing;
    const api = createApiClient({
      baseUrl: stage.apiUrl,
      limiter,
      token: auth.tokenFor(email),
      fetch: clients.fetch,
    });
    apis.set(email, api);
    return api;
  };
  const anonymous = createApiClient({
    baseUrl: stage.apiUrl,
    limiter,
    fetch: clients.fetch,
  });

  const ids = new Map<string, string>();
  const idOf = (email: string): string => {
    const id = ids.get(email);
    if (!id) throw new Error(`${email} was not created`);
    return id;
  };
  const counts: Record<string, number> = {};
  const count = (what: string, by = 1) => {
    counts[what] = (counts[what] ?? 0) + by;
  };

  await auth.run(async () => {
    ids.set(SEED_ADMIN_EMAIL, await auth.createSeedAdmin());
    record.addUser(SEED_ADMIN_EMAIL, idOf(SEED_ADMIN_EMAIL), 'admin');
    count('users');
    const admin = as(SEED_ADMIN_EMAIL);

    const staff = plan.users.filter((user) => user.role !== 'agent');
    await settleAll(staff, async (user) => {
      const { data } = ok(
        await admin.POST('/users', {
          body: { email: user.email, name: user.name, role: user.role },
        }),
        `Create ${user.email}`,
      );
      ids.set(user.email, data.id);
      record.addUser(user.email, data.id, user.role);
      count('users');
    });

    ok(
      await admin.POST('/agent-codes', {
        body: { agentCodes: plan.agentCodes },
      }),
      'Create agent codes',
    );
    count('agent codes', plan.agentCodes.length);

    const groupIds: string[] = [];
    await settleAll(plan.groups, async (group, g) => {
      const { data } = ok(
        await admin.POST('/groups', {
          body: { name: group.name, trainer_ids: group.trainers.map(idOf) },
        }),
        `Create group ${group.name}`,
      );
      groupIds[g] = data.id;
      record.add('groups', data.id);
      count('groups');
    });
    report(
      `Created the seed admin, ${staff.length} trainers and ${plan.groups.length} groups`,
    );

    const agents = plan.users.filter((user) => user.role === 'agent');
    await settleAll(agents, async (agent) => {
      const { data } = ok(
        await anonymous.POST('/auth/register', {
          body: {
            fullName: agent.name,
            agentCode: agent.agentCode!,
            email: agent.email,
            groupId: groupIds[agent.group!],
            location: agent.profile.location!,
          },
        }),
        `Register ${agent.email}`,
      );
      ids.set(agent.email, data.user.id);
      record.addUser(agent.email, data.user.id, 'agent');
      count('users');
    });

    await settleAll(plan.users, async (user) =>
      ok(
        await admin.PUT('/users/{userId}', {
          params: { path: { userId: idOf(user.email) } },
          body: user.profile,
        }),
        `Update ${user.email}`,
      ),
    );
    await settleAll(
      agents.filter((agent) => agent.leader),
      async (leader) =>
        ok(
          await admin.PUT('/groups/{groupId}', {
            params: { path: { groupId: groupIds[leader.group!] } },
            body: { leader_id: idOf(leader.email) },
          }),
          `Make ${leader.email} leader`,
        ),
    );
    report(`Registered ${agents.length} agents and named a leader per group`);

    // One owner's changes run in order: parallel awards for one user conflict.
    await settleAll(
      groupBy(plan.prospects, (prospect) => prospect.owner),
      async ([owner, prospects]) => {
        const api = as(owner);
        for (const prospect of prospects) {
          const { data } = ok(
            await api.POST('/prospects', { body: prospect.create }),
            `Create a prospect for ${owner}`,
          );
          record.add('prospects', data.id);
          count('prospects');
          for (const step of prospect.steps) {
            ok(
              await api.PUT('/prospects/{prospectId}', {
                params: { path: { prospectId: data.id } },
                body: step,
              }),
              `Update prospect ${data.id}`,
            );
          }
        }
      },
    );
    report(
      `Created ${counts.prospects} prospects and moved them through their stages`,
    );

    await settleAll(plan.events, async (event) => {
      const { data } = ok(
        await as(event.organiser).POST('/events', {
          body: {
            ...event.body,
            groupIds: event.groups.map((g) => groupIds[g]),
          },
        }),
        `Create event ${event.body.title}`,
      );
      record.add('events', data.id);
      count('events');
    });

    const sessionIds: string[] = [];
    await settleAll(plan.sessions, async (session, s) => {
      const { data } = ok(
        await as(session.host).POST('/coaching-sessions', {
          body: { ...session.body, groupIds: [groupIds[session.group]] },
        }),
        `Create session ${session.body.title}`,
      );
      sessionIds[s] = data.id;
      record.add('sessions', data.id);
      count('sessions');
    });
    const joins = plan.sessions.flatMap((session, s) =>
      session.joiners.map((joiner) => ({ joiner, s })),
    );
    await settleAll(
      groupBy(joins, (join) => join.joiner),
      async ([joiner, sessions]) => {
        for (const { s } of sessions) {
          ok(
            await as(joiner).POST('/coaching-sessions/{sessionId}/join', {
              params: { path: { sessionId: sessionIds[s] } },
            }),
            `Join session ${sessionIds[s]} as ${joiner}`,
          );
          count('joins');
        }
      },
    );
    report(
      `Created ${counts.events} events and ${counts.sessions} sessions with ${counts.joins} joins`,
    );

    for (const upload of plan.reports) {
      // The skip-ahead guard reads an index, which can miss the month just sent.
      const { data } = ok(
        await retryOnStatus(
          () => admin.POST('/reports/upload', { body: upload.body }),
          409,
        ),
        `Upload the ${upload.year}-${upload.month} sales report`,
      );
      record.add('batches', data.batchId);
      if (data.skipped) {
        throw new Error(
          `The ${upload.year}-${upload.month} report skipped ${data.skipped} rows`,
        );
      }
      count('sales reports');
    }
    report(`Uploaded ${plan.reports.length} monthly sales reports`);
  });

  for (const line of describeGrowth(
    failuresBefore,
    await failureDepths(stage, clients.sqs),
  )) {
    report(`Warning: ${line}`);
  }
  return counts;
}

async function main(): Promise<void> {
  const stage = await resolveStage(stageFromArgs(process.argv.slice(2)));
  const clients: ISeedClients = {
    // Every user's first sign-in starts at once, outside the request limiter.
    cognito: new CognitoIdentityProviderClient({
      region: stage.region,
      retryMode: 'adaptive',
      maxAttempts: 8,
    }),
    dynamo: DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: stage.region }),
    ),
    sqs: new SQSClient({ region: stage.region }),
  };
  console.log(`Seeding ${stage.name} through ${stage.apiUrl}`);
  try {
    const counts = await seedStage(stage, clients, {
      report: (line) => console.log(line),
    });
    console.log('Done:', counts);
    console.log(
      'Points and statistics follow from the stream consumers within a minute.',
    );
  } catch (error) {
    if (!(error instanceof SeedDataPresentError)) {
      console.error(`To remove what was created: ${resetCommand(stage.name)}`);
    }
    throw error;
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(messageOf(error));
    process.exitCode = 1;
  });
}
