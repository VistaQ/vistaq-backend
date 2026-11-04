# Tasks

Table keys and GSIs come from `docs/dynamodb-access-patterns.html` (Draft 2). Groups 1 to 3 do not need them.

## 1. Serverless v4 setup

- [x] 1.1 Install `serverless@4` as a devDependency with `npm i -D serverless@4` and verify `npx sls --version` prints a 4.x version; document in `README.md` that all commands run as `npx sls <command>` (installed as `^4.46.0` and documented; the version check needs a run outside the sandbox, which cannot download the framework binary)
- [x] 1.2 Add `serverless.yml` with the service name, runtime, region, stage parameter and an empty `functions` block, and verify `npx sls print --stage dev` resolves without error
- [x] 1.3 Add npm scripts `deploy`, `remove` and `package` wrapping `npx sls`, and verify `npm run package` builds a bundle for the dev stage

## 2. Lambda entry point

- [x] 2.1 Add `src/lambda.ts` exporting a handler that wraps the Express app with `serverless-http`, and verify a unit test invokes it with an API Gateway v2 event for `GET /health` and gets 200
- [x] 2.2 Declare the API function in `serverless.yml` with a catch-all `{proxy+}` route plus explicit routes for the public paths (health, `/openapi.yaml`, register, login, login/verify, `/api/public/*`, `/api/internal/*`) and an unauthenticated `OPTIONS` route for CORS preflight, and verify `npx sls package` includes the handler
- [x] 2.3 Remove `vercel.json`, the Vercel build script, `VERCEL_ENV` and the `api/` artifact references, keeping `src/main.ts` for local development, and verify `npm run verify` passes
- [x] 2.4 Make `src/utils/env.ts` fail at cold start naming any missing variable, with a unit test for the error message

## 3. Cognito and gateway authorization

- [x] 3.1 Declare the Cognito user pool (Essentials tier or higher, `AllowedFirstAuthFactors` set to `PASSWORD` and `EMAIL_OTP` because Cognito requires `PASSWORD`, SES as the email sender), the app client (`ALLOW_USER_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` only, `PreventUserExistenceErrors` on) and the JWT authorizer (no role groups: the role lives in the user record) in `serverless.yml`, and verify `npx sls package` produces a template containing all of them
- [x] 3.2 Leave the register, login, login/verify, health, openapi, `/api/public/*`, `/api/internal/*` and `OPTIONS` routes public and attach the authorizer to every other route, with a spec check that lists routes without an authorizer
- [x] 3.3 Replace `src/middleware/auth.ts` so it takes `sub` from the verified token and loads role, group and status from the user record on every request, and verify unit tests cover a missing user record, a role changed after sign-in, a deactivated user with a valid token (inactive-account error) and a forbidden role returning 403
- [ ] 3.4 Rewrite the auth service for register (`AdminCreateUser` with a verified email and `MessageAction: SUPPRESS`, then `AdminSetUserPassword` with a random permanent password nobody sees), login (`InitiateAuth` with `USER_AUTH` and `EMAIL_OTP`), login/verify (`RespondToAuthChallenge`) and logout with AWS SDK v3; register writes the user record with `id = sub` and deletes the Cognito user if that write fails, and deactivating a user also disables them in Cognito; verify unit tests with a mocked client cover every scenario in `specs/cognito-authentication`
- [ ] 3.5 Remove the forgot-password, reset-password and change-password routes, controllers, services and Zod schemas, and verify a request to each returns 404
- [ ] 3.6 Rewrite `scripts/create-admin.js` and `scripts/bootstrap.js` to create passwordless Cognito users, and verify running `create-admin` against the dev stage creates a user who can complete the code sign-in
- [ ] 3.7 Update `openapi.yaml` for the two-step login, the removed password routes, the passwordless register body and the removed tenant claim, and verify the OpenAPI document validates
- [ ] 3.8 On the dev stage, register a user and sign in with the emailed code, and record whether the `AdminCreateUser` state allows it; if not, switch register to `SignUp` plus confirmation and update `design.md`

## 4. DynamoDB table and repositories

- [x] 4.1 Spike: declare one multi-attribute GSI in `serverless.yml`, run `npx sls package` and a dev deploy, and record in `design.md` whether it deploys and whether sparse behaviour (item missing a key attribute left out) holds; if it does not deploy, switch the design to concatenated keys before continuing
- [ ] 4.2 Declare every table, GSI and stream (`NEW_AND_OLD_IMAGES` on Prospects and CoachingAttendance) from the access-pattern doc, including `AwardGuards`, with no `Uniques` table, and verify `npx sls package` lists them
- [x] 4.3 Add one UTC period helper (month start, year start, `ym` bucket) and use it in leaderboard, dashboard and group code, with unit tests for a timestamp at 23:30 UTC on the last day of a month
- [ ] 4.4 Replace `SupabaseService` with a DynamoDB client wrapper and rewrite each repository against it (repositories omit key attributes that are empty rather than writing null), with repository unit tests per entity
- [ ] 4.5 Write every stored timestamp through one helper that produces `YYYY-MM-DDTHH:mm:ss.sssZ`, return stored values as they are (no transform on the way out), and verify a test that a written timestamp has the `Z` suffix and date-only fields are written and returned unchanged
- [ ] 4.6 Remove the Supabase client, `SUPABASE_*` variables, `supabase/` and its npm scripts, and verify `npm run verify` and the unit tests pass

## 5. Stream consumers

- [ ] 5.1 Add the award-points function with event source mappings on the Prospects and CoachingAttendance streams, bisect-on-error, bounded retries and an SQS on-failure destination in `serverless.yml`, and verify the packaged template contains the mappings and the queue
- [ ] 5.2 Port the activity rules from the old edge function (created, deleted, appointment set, sales meeting, sale closed, coaching attended with the coaching-type mapping and the duration multiplier, unknown type and invalid duration skipped with a warning), and verify unit tests cover every scenario in `specs/award-points-stream`
- [ ] 5.3 Write each ordinary award as one `TransactWriteItems` of the `AwardGuards` put (`attribute_not_exists`), the ledger row and the `PointTotals` increment, and verify tests that a record processed twice and two concurrent deliveries leave exactly one transaction
- [ ] 5.4 Compensate a deleted prospect by reading its guards with a strongly consistent query and negating the positive total, and verify tests for a prospect with awards and one without
- [ ] 5.5 Log an error for an activity with no point configuration or activity type and write nothing, and verify the unit test
- [ ] 5.6 Add the stats stream consumer that forwards each changed agent id to an SQS FIFO queue with `MessageGroupId = agent_id`, and the recompute function that rebuilds an agent's month buckets and clears empty ones, with a dead-letter queue, and verify unit tests for the scenarios in `specs/activity-stats` (month move, deletion, redelivery)
- [ ] 5.7 Confirm the Prospects stream has exactly two consumers in the packaged template, and note in `design.md` that a third needs a fan-out

## 6. List behaviour changes

- [ ] 6.1 Paginate `GET /prospects` for admins and master trainers (default limit 50, maximum 100, opaque `nextToken`, optional stage filter, `byStage` index), and verify tests for first page, next page, stage filter, last page and a limit above the maximum
- [ ] 6.2 Add the creator query to the trainer event list, and verify a trainer sees an event they created that targets none of their groups and does not see another trainer's
- [ ] 6.3 Return `attendance_total` and `attendance_joined` on coaching-session list items and keep them current on every attendance change, with full attendance on the detail view only, and verify tests for list, detail and a status change to joined
- [ ] 6.4 Update `openapi.yaml` for the three changes above and the `Z` timestamps, and verify the document validates

## 7. Operations and cutover

- [ ] 7.1 Deploy the staging stage and run the register, code login, protected call, logout and award-points flows, recording the results
- [ ] 7.2 Update CI to install dependencies with `npm ci` and deploy through `npx sls deploy --stage <stage>`, and verify a pipeline run on staging succeeds

## 8. Logging and Sentry removal

- [x] 8.1 Remove Pino, `LoggingService`, the request-logging middleware, the correlation ID and `morgan` with all call sites, and verify `npm run verify` passes and no `logging.service` reference remains in `src` or `tests`
- [x] 8.2 Remove Sentry (SDK, init, metrics, per-request tags, user context, `SENTRY_DSN`, the seed script) and unwrap the span wrappers, and verify no `sentry` reference remains in `src`, `tests`, `package.json` or `serverless.yml`
- [x] 8.3 Update `.claude/rules/logging.md` and `error-handling.md` so later work does not re-add logging, and verify the rules state it is intentionally absent
- [x] 8.4 Replace the Sentry and logging tests with an error-handler test, and verify the unit suites show no failure that was not already failing before the change

## Workflow follow-up

- Archive the change after the production cutover is confirmed.
- Choose and add a logging and error-reporting replacement as its own change (AWS-native option or another package). The award-points requirements that say an error is logged depend on it.
