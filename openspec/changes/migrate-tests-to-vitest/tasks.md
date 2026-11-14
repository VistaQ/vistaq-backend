# Tasks

## 1. Switch the runner to Vitest

- [x] 1.1 Install `vitest`, `@vitest/coverage-v8` and `vite` as devDependencies with exact versions (5.1.0, 5.1.0, 8.3.8 at the time of writing); verify `npx vitest --version` prints 5.1.0
- [x] 1.2 Add `vitest.config.mts` (Node environment, `tests/**/*.test.ts`, the `@src` alias through `resolve.alias`, `setupFiles: ['tests/helpers/setEnv.ts']`, v8 coverage over `src/`), and point `test`, `test:watch` and `test:coverage` at `vitest run`, `vitest` and `vitest run --coverage`; verify the three scripts start Vitest
- [x] 1.3 Make `tests/helpers/setEnv.ts` set fixed values unconditionally (`TABLE_PREFIX`, Cognito pool and client ids, ETL values, and dummy `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) and remove its 10 per-file imports; verify a test reads `test_vistaq_` as the prefix even when `.env` sets another
- [x] 1.4 Remove `@types/jest` first and convert until `npm run verify` passes: `jest.fn`/`spyOn`/`mock` to `vi.*` (150, 41 and 32 calls), the outer `mock*` variables in the 5 factory files (`user.service`, `agentCode.service`, `auth.controller`, `authenticate.middleware`, `auth.service` tests) into `vi.hoisted`, the 179 `jest.Mock`/`jest.Mocked` types to `Mock`/`Mocked` imported from `vitest`, and `env.test.ts` to `vi.resetModules()` with `await import()`; verify `npm run verify` passes with no `jest` reference left under `tests/`
- [x] 1.5 Remove `jest`, `ts-jest`, `jest.config.js` and `tests/global-setup.ts`; verify `npm test` runs all 31 files under Vitest and each file reports the same number of tests as the per-file baseline in the design (370 in total), with no failure outside the 20 named there and the 3 `cognito.service` ones now passing (done 2026-11-14: Vitest 5.1.0 runs 31 files and 370 tests with every per-file count equal to the baseline, 17 failures all among the 20 named, the 3 `cognito.service` tests passing, and the same `expect(` and test counts per file as before the switch. Beyond the plan: env assignments that must precede imports in `etl.service` and `internalKey` tests moved into `vi.hoisted`, `public.controller.test.ts` also needed a hoisted mock, coverage uses `reportOnFailure` so it prints while known failures remain, and `coverage/` is gitignored)

## 2. Repair the stale tests

- [ ] 2.1 Confirm the `.env` leakage is gone: the 3 `cognito.service` failures pass with the fixed test values; verify `npm test` with a `.env` present and with it moved aside gives the same result
- [ ] 2.2 Rewrite `serverless.config.test.ts` against the current `serverless.yml` (stage params including `allowedOrigins` and the staging API domain, `TABLE_PREFIX` as the only table variable, `provider.httpApi.cors`, the unauthenticated `OPTIONS /{proxy+}` and public routes, the JWT authorizer on `ANY /{proxy+}`, `ALLOW_USER_AUTH` without a password flow, IAM scoped to the table prefix); verify the file passes and covers the serverless-deployment and gateway rows of the design map
- [ ] 2.3 Rewrite `env.test.ts` for the variables `env.ts` requires today (`TABLE_PREFIX`, the Cognito ids) and the optional ones (ETL, stats queue, reports bucket); verify it passes and fails when `env.ts` stops requiring `TABLE_PREFIX`
- [ ] 2.4 Triage `reportJob.controller.test.ts`, `user.repository.test.ts` (item and batch-get shapes) and `auth.service.test.ts` (`getUserContext`) against the current code and specs; fix each test whose behaviour still exists and delete any whose behaviour was removed on purpose, writing the reason here; verify `npm test` passes with 0 failures

## 3. Cover the specified behaviour

- [ ] 3.1 Add `unit/repositories/prospect.repository.test.ts` for `findPage` (first page, next page, stage filter, last page with no token, two prospects sharing `updated_at` across a page boundary); verify the tie case fails if the sort tie-breaks by id
- [ ] 3.2 Add `unit/repositories/event.repository.test.ts` (trainer list includes their untargeted event and not another trainer's, offset `start_date`/`end_date` stored as UTC on insert and update, link items carry the UTC `start_date`) and `unit/repositories/coachingSession.repository.test.ts` (list items carry `attendance_total`/`attendance_joined` without attendance rows, a join moves the counts); verify both pass
- [ ] 3.3 Add `unit/repositories/pointTransaction.repository.test.ts` (an award is written once per guard, and `awardWithReversal` runs one user's activities one at a time and writes only the difference on a correction); verify the sequential test fails if the user's moves run in parallel
- [ ] 3.4 Add `unit/awardPoints.service.test.ts` (prospect stage changes, coaching type and duration, deleted-prospect compensation, an unconfigured activity awards nothing) and `unit/handlers/awardPoints.test.ts` (a failing record is reported in `batchItemFailures`); verify both pass
- [ ] 3.5 Add `unit/activityStats.service.test.ts` (monthly counters per agent, a timestamp at 23:30 UTC on the last day of a month lands in that month) and `unit/handlers/statsStream.test.ts` and `unit/handlers/statsRecompute.test.ts` (messages grouped by agent, recompute writes the same counters when run twice, failures reported); verify all pass
- [ ] 3.6 Extend the auth tests for the regressions: `cognito.service`/`auth.service` (unknown or disabled email gets a decoy session that fails verification as a wrong code), `authenticate.middleware` (a token issued at or before `signed_out_at` gets 401, an inactive user 403), `user.service` (`getVisibleUserById` hides users outside the caller's visibility); verify each fails when its fix is reverted
- [ ] 3.7 Check every row of the design's requirement-to-test map against `npm test`; verify each listed file exists and passes, and record the logging-dependent gap in "Missing configuration is visible"

## 4. Gate the deploy and update the docs

- [ ] 4.1 Add a `npm test` step to `.github/workflows/staging.yml` after `npm run verify` and before the AWS login and deploy; verify a workflow run on `feature/migrate-to-serverless` (or its successor branch) shows the test step passing before the deploy
- [ ] 4.2 Update the Verification section of `.claude/CLAUDE.md` with `npm test` and `npm run test:coverage`, and the README's test commands; verify both name Vitest and no Jest command remains in the repo (`rg -n "jest" --glob '!node_modules' --glob '!openspec/changes/archive/**'` finds only intentional mentions)

## Workflow follow-up

- Retired on 2026-11-14 after 1.5: the "no tests during the migration" feedback memory and graphmind memory `654f6d0d` (keep Jest until the Vitest change).
- Archive the change with `/opsx:archive` after group 4.
