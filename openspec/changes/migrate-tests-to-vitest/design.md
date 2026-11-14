# Design

## Context

The suite is 31 files under `tests/` (370 tests) on Jest 30 with `ts-jest`, configured in `jest.config.js` with a `globalSetup` that loads `.env` and sets `NODE_ENV=test`. A baseline run on 2026-11-14 passed 25 suites and failed 6, 20 tests in all:

| Failing file | Failed | Cause in short |
|---|---|---|
| `unit/serverless.config.test.ts` | 4 | asserts the pre-migration `serverless.yml` (`NODE_ENV`, `ALLOWED_ORIGINS`, per-table env vars, the old AgentCodes key) |
| `unit/env.test.ts` | 5 | expects per-table and ETL variables that `env.ts` no longer requires |
| `unit/sales-report/reportJob.controller.test.ts` | 4 | upload and retry assertions written before the controller's migration changes; to triage |
| `unit/cognito.service.test.ts` | 3 | `.env` leakage: compares the real dev pool and client ids with the test values |
| `unit/repositories/user.repository.test.ts` | 3 | asserts the old per-table name (`users-table`) and item and batch-get shapes from before `DynamoTable` |
| `unit/auth/auth.service.test.ts` | 1 | `getUserContext` throws inside the service; to triage |

The `.env` leakage comes from `globalSetup` loading `.env` before `tests/helpers/setEnv.ts`, which only fills missing values (`??=`), so a developer's real ids override the test values. No suite takes over half a second, so nothing reaches the network today.

**Per-file baseline** (Jest, 2026-11-14), the yardstick for the conversion: after group 1 every file must report the same number of tests, and the only failures allowed are the 20 named below, minus the 3 `cognito.service` ones that fixed test values should turn green.

| File (under `tests/`) | Tests | Passed | Failed |
|---|---|---|---|
| `health.test.ts` | 8 | 8 | 0 |
| `unit/agentCodes/agentCode.controller.test.ts` | 27 | 27 | 0 |
| `unit/agentCodes/agentCode.service.test.ts` | 12 | 12 | 0 |
| `unit/auth/auth.controller.test.ts` | 15 | 15 | 0 |
| `unit/auth/auth.schemas.test.ts` | 13 | 13 | 0 |
| `unit/auth/auth.service.test.ts` | 17 | 16 | 1 |
| `unit/auth/authenticate.middleware.test.ts` | 10 | 10 | 0 |
| `unit/cognito.service.test.ts` | 22 | 19 | 3 |
| `unit/dynamo.service.test.ts` | 18 | 18 | 0 |
| `unit/env.test.ts` | 8 | 3 | 5 |
| `unit/errorHandlers.test.ts` | 6 | 6 | 0 |
| `unit/groups/group.controller.test.ts` | 21 | 21 | 0 |
| `unit/lambda/lambda.handler.test.ts` | 3 | 3 | 0 |
| `unit/period.test.ts` | 5 | 5 | 0 |
| `unit/prospects/prospect.controller.test.ts` | 24 | 24 | 0 |
| `unit/public/public.controller.test.ts` | 2 | 2 | 0 |
| `unit/repositories/agentCode.repository.test.ts` | 10 | 10 | 0 |
| `unit/repositories/groupTrainer.repository.test.ts` | 4 | 4 | 0 |
| `unit/repositories/user.repository.test.ts` | 15 | 12 | 3 |
| `unit/sales-points/salesPoints.service.test.ts` | 10 | 10 | 0 |
| `unit/sales-report/etl.service.test.ts` | 3 | 3 | 0 |
| `unit/sales-report/generateJobReference.test.ts` | 5 | 5 | 0 |
| `unit/sales-report/internalKey.test.ts` | 3 | 3 | 0 |
| `unit/sales-report/reportFileCleanup.controller.test.ts` | 2 | 2 | 0 |
| `unit/sales-report/reportJob.controller.test.ts` | 12 | 8 | 4 |
| `unit/sales-report/salesReport.controller.test.ts` | 23 | 23 | 0 |
| `unit/sales-report/salesReport.service.read.test.ts` | 13 | 13 | 0 |
| `unit/sales-report/salesReport.service.upload.test.ts` | 13 | 13 | 0 |
| `unit/sales-report/scope.service.test.ts` | 8 | 8 | 0 |
| `unit/serverless.config.test.ts` | 13 | 9 | 4 |
| `unit/users/user.service.test.ts` | 25 | 25 | 0 |
| **Total** | **370** | **350** | **20** |

The 20 failing tests, by file and title:
- `auth/auth.service`: getUserContext reads the user with a strongly consistent read
- `cognito.service`: creates a verified user without an email, then sets a random permanent password; starts the USER_AUTH flow asking for an emailed code and returns the session; disableUser, enableUser and deleteUser target the user in the pool
- `env`: throws naming USERS_TABLE, AGENT_CODES_TABLE, GROUP_TRAINERS_TABLE, ETL_SERVICE_URL and ETL_API_KEY when it is missing (5 tests)
- `repositories/user.repository`: writes a lowercased email, omits empty optional fields and refuses to overwrite; findByIds removes duplicates before the batch get; findIdNameAgentCodeByIds filters to the permitted groups and short-circuits an empty scope
- `sales-report/reportJob.controller`: create returns 202 with the reference (not the UUID) on success; create maps NonConsecutiveUploadError to 409 Conflict; retry returns 202 with the reference on success; retry maps JobNotRetryableError to 409 Conflict
- `serverless.config`: runs every deployed stage as production so helmet and the CORS allow-list apply; requires ALLOWED_ORIGINS with no default so a missing value fails at deploy; keys AgentCodes on the code with a byUsed index; passes every table name to the function `tsconfig.json` type-checks `src` and `tests` as one project, the package is CommonJS, and CI runs Node 22. Conversion load: 150 `jest.fn`, 41 `jest.spyOn`, 32 `jest.mock` factories in 13 files (5 of them reference outer `mock*` variables), 179 `jest.Mock`/`jest.Mocked` types in 14 files, `require()` and `jest.resetModules` in `env.test.ts` only, and 10 files importing `tests/helpers/setEnv.ts`. There is no `jest.requireActual`, no fake timers and no `done` callback.

## Goals / Non-Goals

**Goals:**
- Vitest as the only runner, with the same commands (`npm test`, `test:watch`, `test:coverage`).
- A suite that passes offline, without `.env`, and maps every requirement in `openspec/specs/` to a test.

**Non-Goals:**
- End-to-end tests against a deployed stage; the live checks done during the migration stay manual scripts.
- A coverage percentage threshold; coverage is reported, not enforced, until the deferred tests land and a baseline exists.
- Running tests in the Stop hook; `npm run verify` stays lint and type-check so stopping stays fast.

## Decisions

**Vitest 5 with Vite 8, no extra plugins.** Vitest 5 takes Vite as a peer dependency, so `vite` is installed explicitly beside `vitest` and `@vitest/coverage-v8`. Both need Node `>=22.12`, which CI's Node 22 satisfies. The `@src/*` alias is mapped with `resolve.alias` rather than `vite-tsconfig-paths`; it is the only alias, so a plugin adds a dependency for one line.

**Config file is `vitest.config.mts`.** The package is CommonJS; an `.mts` config keeps Vite on its ESM config path instead of the deprecated CJS one. Alternative: switch the package to ESM, which would change how the app and scripts load and is out of scope.

**Explicit imports, no `globals: true`.** Test files import `describe`, `it`, `expect`, `vi` and the `Mock`/`Mocked` types from `vitest`. Globals would need `vitest/globals` in the shared `tsconfig.json`, which would make `describe` and `vi` type-check inside `src` as well. Explicit imports cost one line per file and keep `src` free of test globals.

**Environment through `setupFiles`, not `globalSetup`.** `src/utils/env.ts` reads variables at import, inside each worker. A `setupFiles` entry (the current `tests/helpers/setEnv.ts`, extended) sets fixed values before any test module loads: `TABLE_PREFIX`, the Cognito ids, the optional ETL values, and dummy `AWS_REGION`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. The dummy credentials make an unstubbed AWS call fail fast with a signature error instead of walking the default credential chain. The 10 per-file `setEnv` imports are removed. `.env` is never read.

**AWS calls are stubbed with `aws-sdk-client-mock`.** It is already a devDependency, works with any runner, and intercepts at the SDK client, so repositories and services are tested through `DynamoService` and the real command shapes.

**Mechanical conversion, then the compiler.** `jest.fn`/`spyOn`/`mock` become `vi.*`; the 5 factories that reference outer variables move those variables into `vi.hoisted`; `jest.Mock` and `jest.Mocked<T>` become `Mock` and `Mocked<T>` from `vitest`; `env.test.ts` uses `vi.resetModules()` and `await import()` instead of `require`. Removing `@types/jest` first lets `tsc -b` list every remaining Jest reference, the way it listed the tenant references in the migration.

**Stale tests are repaired against the specs, or deleted with a reason.** Each of the 6 failing files is checked against the current behaviour in `openspec/specs/` and the code. A test is fixed when the behaviour it checks still exists and deleted when the behaviour was removed on purpose (for example the tenant guard); the reason is written in the task.

**Requirement-to-test map.** Group 3 is done when every row has a passing test. "New" means the file does not exist yet.

| Spec | Requirement | Test file |
|---|---|---|
| activity-stats | Monthly counters per agent | `unit/activityStats.service.test.ts` (new) |
| activity-stats | Counters follow prospect changes | `unit/activityStats.service.test.ts` (new) |
| activity-stats | Recompute is idempotent and ordered per agent | `unit/handlers/statsStream.test.ts`, `unit/handlers/statsRecompute.test.ts` (new) |
| activity-stats | Recompute failures are kept | `unit/handlers/statsStream.test.ts`, `unit/handlers/statsRecompute.test.ts` (new) |
| award-points-stream | Points follow data changes | `unit/awardPoints.service.test.ts` (new) |
| award-points-stream | Coaching points follow session type and duration | `unit/awardPoints.service.test.ts` (new) |
| award-points-stream | Deleted prospects are compensated | `unit/awardPoints.service.test.ts` (new) |
| award-points-stream | Idempotent awarding | `unit/repositories/pointTransaction.repository.test.ts` (new) |
| award-points-stream | Failures are retried and kept | `unit/handlers/awardPoints.test.ts` (new) |
| award-points-stream | Missing configuration is visible | `unit/awardPoints.service.test.ts` (new); the logged warning waits for the logging replacement |
| cognito-authentication | Registration with agent code | `unit/auth/auth.service.test.ts` |
| cognito-authentication | Sign-in starts with an emailed code | `unit/cognito.service.test.ts`, `unit/auth/auth.service.test.ts` |
| cognito-authentication | Sign-in completes with the code | `unit/cognito.service.test.ts`, `unit/auth/auth.controller.test.ts` |
| cognito-authentication | No password credentials | `unit/serverless.config.test.ts`, `unit/lambda/lambda.handler.test.ts` |
| cognito-authentication | Logout revokes the session | `unit/auth/authenticate.middleware.test.ts`, `unit/auth/auth.service.test.ts` |
| cognito-authentication | Gateway-level authorization | `unit/serverless.config.test.ts` |
| cognito-authentication | CORS is answered at the gateway | `unit/serverless.config.test.ts` |
| cognito-authentication | Authenticated user context | `unit/auth/authenticate.middleware.test.ts` |
| record-listing | Prospect list is paginated | `unit/repositories/prospect.repository.test.ts` (new), `unit/prospects/prospect.controller.test.ts` |
| record-listing | Trainers see events they created | `unit/repositories/event.repository.test.ts` (new) |
| record-listing | Coaching list returns attendance counts only | `unit/repositories/coachingSession.repository.test.ts` (new) |
| serverless-deployment | Infrastructure is declared in serverless.yml | `unit/serverless.config.test.ts` |
| serverless-deployment | Single API function | `unit/serverless.config.test.ts` |
| serverless-deployment | Stage-scoped configuration | `unit/serverless.config.test.ts` |
| serverless-deployment | Least-privilege permissions | `unit/serverless.config.test.ts` |

**Named regression tests** for the defects the migration found and fixed:

| Defect | Test file |
|---|---|
| A user's sales awards ran as parallel transactions and one was lost to `TransactionConflict` | `unit/repositories/pointTransaction.repository.test.ts` |
| `GET /users/{userId}` returned any user to any caller | `unit/users/user.service.test.ts` |
| Event and coaching dates sent with an offset were stored with it | `unit/period.test.ts`, `unit/repositories/event.repository.test.ts` |
| An unknown email at login answered with an error or a usable challenge | `unit/cognito.service.test.ts` |
| A token issued before logout still authenticated | `unit/auth/authenticate.middleware.test.ts` |
| A prospect page could skip items when two shared `updated_at` | `unit/repositories/prospect.repository.test.ts` |

## Risks / Trade-offs

- [`vi.mock` hoisting differs from Jest's in edge cases, so a converted file can mock the wrong module silently] → Run each converted file on its own once and compare its test count with the Jest baseline.
- [Vitest 5 and Vite 8 are recent majors] → Pin exact versions in `package.json`; the suite is small enough to re-run on any upgrade.
- [Deleting stale tests can hide a real regression] → Delete only when the behaviour was removed on purpose and the spec no longer requires it, and write the reason in the task.
- [Tests in CI lengthen every staging deploy] → The suite runs in about a second locally; the cost is install time, which the workflow already pays.

## Migration Plan

1. Land the runner switch and the conversion together (Vitest cannot run unconverted files), with the 6 known failures listed.
2. Repair or delete the stale tests until the suite is green.
3. Add the missing tests from the map.
4. Add the test step to `staging.yml` and the Verification section of `.claude/CLAUDE.md`.

Rollback before step 4 is reverting the commits; nothing deployed depends on the runner.
