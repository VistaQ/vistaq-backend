# Design

## Context

Staging (`vistaq-staging`, ap-southeast-5) holds one real admin, 13 point activity types and 13 point configs. The facts that shape the seed:

- **What the API allows.**
  - An admin can create groups (with `trainer_ids` and `leader_id`, where the leader is promoted to `group_leader`), users of role admin, master_trainer, trainer or agent (`POST /users`), agent codes, events, coaching sessions and monthly sales reports (`POST /reports/upload`).
  - Agents register through the public `POST /auth/register` with an agent code and a group.
  - Agents create and update their own prospects. Trainers and leaders create events and sessions; agents join sessions.
  - There is no route to delete a group or to delete ledger, totals, statistics, guard, sales-award or report rows.
- **The API stamps the server clock.** Prospect `created_at`, stage history, `appointment_completed_at`, `sales_completed_at` and `joined_at` come from the clock, and event and coaching start dates must not be in the past. Sales reports name their year and month and must not skip a month.
- **Email and sign-in.**
  - Both `/auth/register` and `POST /users` create Cognito users with `MessageAction: SUPPRESS`, so they send no email.
  - The user pool must list `PASSWORD` as a first factor, so `USER_AUTH` with `PASSWORD` works for any user whose password is known. Access tokens last 15 minutes.
- **Concurrency.** The account's Lambda concurrency limit in ap-southeast-5 is 10, shared by the API and the three stream and queue consumers.
- **Modules.** The package is CommonJS and scripts run under `ts-node`. `openapi-fetch` 0.17.0 and `openapi-typescript` 7.13.0 both ship a `require` build.
- **Stream side effects.** Deleting a prospect fires a clawback award and a stats recompute, and deleting attendance fires a recompute. Both can write rows after the delete that caused them. The staging cleanups in `migrate-to-serverless-lambda` handled this by deleting, waiting for the queues to drain, and scanning again.

## Goals / Non-Goals

**Goals:**
- A demo data set on any non-production stage, created only through the API apart from the first admin.
- Reset that returns the stage to exactly its state before the seed.

**Non-Goals:**
- Backdated prospect history. That needs direct writes, which `scripts/seed.ts` already does for dev.
- Production, or replacing `scripts/seed.ts`.
- Configuring point values; the stage's existing configs are used as they are.

## Decisions

**Layout.** `scripts/seed-api/` holds:
- `stage.ts`, which resolves a stage to its API URL, pool, client and tables;
- `auth.ts`: the seed admin, temporary passwords and sign-in;
- `client.ts`: the `openapi-fetch` client with retry;
- `plan.ts`: the data plan, pure and deterministic from a faker seed;
- `seed.ts` and `reset.ts`: the commands;
- `api.d.ts`: generated.

npm scripts: `seed:api`, `seed:api:reset` and `gen:api`. Alternative: a Postman collection run, rejected because the chained ids, per-user tokens and loops would live in Postman scripts outside git.

**The stage comes from the stack, not env vars.** `--stage` is required. The API URL, `UserPoolId` and `UserPoolClientId` come from the `vistaq-<stage>` stack outputs, and table names from the stack's `AWS::DynamoDB::Table` resources. A stage named `production`, or a stack whose tables start with `prod_`, is refused before any request.

**The first admin is the one direct write.** `seed-admin@example.com` is created the way `scripts/create-admin.js` does it: `AdminCreateUser` with `SUPPRESS`, a random password, and a Users item with role admin. Everything else goes through the API as that admin or as the owning user. The owner's real admin is never used, and the seed never calls `/auth/logout`, because `signed_out_at` would revoke real sessions.

**Temporary passwords.**
- The seed generates one strong random password per run and keeps it in memory.
- For each user it signs in as, it calls `AdminSetUserPassword` with that password, then `USER_AUTH` with `PASSWORD`.
- On a 401 it signs in again. A `finally` block, together with a `SIGINT` handler, sets every user it touched to a fresh random password before exit.

**Plan, mirroring dev's `seed.ts`.** A fixed faker seed gives:
- 1 master trainer and 3 trainers, created with `POST /users`;
- 5 groups named `Seed <name>`, each with trainers;
- 40 agent codes `SEED0001`… (30 used and 10 left unused);
- 30 agents registered through `/auth/register`, 6 per group, as `seed-agent-NN@example.com`, with one per group made leader through the group's `leader_id`;
- 6 to 14 prospects per agent, each moved through `PUT /prospects/{id}` to its planned stage and outcome;
- about 8 events and 8 coaching sessions in the coming 1 to 8 weeks, titled `Seed: …`, with about half the targeted agents joining;
- one sales report per month from January to last month, uploaded in order by the seed admin, with per-agent cumulative YTD figures.

Users are `seed-<role>-NN@example.com`. Together with the `Seed`/`SEED` prefixes, these are the seed markers.

**Low, retried concurrency.** At most 3 requests run at once, with exponential backoff on 429 and 5xx. That leaves room in the account's 10 concurrent executions for the consumers the seed triggers.

**A run record, with markers as the fallback.** The seed writes created ids to `scripts/seed-api/.runs/<stage>.json`, which is gitignored and replaces the stale `scripts/demo-seed-manifest.json` entry.
- Before creating anything, the seed checks for existing seed users (a Cognito `ListUsers` filter on `email ^= "seed-"`) and refuses if it finds any.
- Reset uses the run record when it exists, and otherwise rebuilds the seed set from the markers: seed users by email, groups by name, agent codes by prefix, and every record owned by, created by or about a seed user, group, event, session or upload batch.

**Reset deletes directly, then sweeps until clean.** There are no delete routes for groups or derived rows, so reset deletes by key through the AWS SDK:
1. Delete everything referencing a seed id.
2. Wait for the stats queue and the failure queues to drain.
3. Scan every table for any item whose string attributes reference a seed id or marker, delete those, and repeat until a scan finds none.
4. Delete the seed users from Cognito.

`--dry-run` lists what would be deleted. Items with no seed reference, such as the real admin, the activity types and the point configs, are never selected.

**Committed generated types, guarded by a test.** `npm run gen:api` runs `openapi-typescript` on `openapi.yaml` and formats the result with Prettier into `scripts/seed-api/api.d.ts`. A unit test regenerates the types in memory the same way and compares them with the committed file, so CI fails on drift. If lint rules flag the generated file, it goes into ESLint's global `ignores`, which isn't a per-folder override.

**Requirement-to-test map.**

| Requirement | Test |
|---|---|
| The seed targets one non-production stage | `unit/seedApi/stage.test.ts`: production by name and by `prod_` prefix refused, missing stage refused, outputs and tables resolved from a mocked stack |
| Data enters through the API | `unit/seedApi/plan.test.ts` (deterministic plan, markers, owners) and the live run in task 4.2 |
| Seeding sends no email and leaves no known password | `unit/seedApi/auth.test.ts`: `AdminCreateUser` with `SUPPRESS`; every touched user is re-randomised in `finally`, including after a thrown error |
| The seed does not run twice over its own data | `unit/seedApi/seed.test.ts`: existing seed users stop the run before any create call |
| Reset removes the seed and nothing else | `unit/seedApi/reset.test.ts` (selection from markers and ids keeps unrelated items; the sweep repeats until clean) and the live snapshot comparison in task 4.3 |
| Generated client matches `openapi.yaml` | `unit/seedApi/apiTypes.test.ts` |

## Risks / Trade-offs

- [All prospect activity lands in the current month, so dashboards show one month of history] → It's stated in the proposal. The sales reports cover the earlier months. Backdating would mean direct writes, which is a non-goal.
- [The account's 10 concurrent Lambda executions throttle the seed or the consumers] → 3 concurrent requests with backoff. The same limit matters for production, so raising the quota belongs with the production change.
- [Reset deletes something that isn't seed data] → Selection only by seed id or marker, unit tests on the selection, `--dry-run`, and a live before-and-after snapshot comparison.
- [A crash leaves known passwords] → `finally` and `SIGINT` re-randomise them. Reset deletes the users anyway.
- [The frontend team sees demo data beside real staging data] → Markers make it recognisable, and reset removes it.

## Migration Plan

1. Build and unit-test the seed against mocks.
2. Run it on dev first. Dev's direct-seed data stays, and reset removes only the API seed. Compare snapshots.
3. Run it on staging. Snapshot before, seed, check the counts and derived data through the API, then reset and compare once, then seed again for the frontend team.

Rollback is the reset command.
