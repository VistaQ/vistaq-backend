# Design

## Context

The API is an Express 5 app started by `src/main.ts`, deployed to Vercel, with every repository calling Supabase through `SupabaseService`. Auth, data and the `award-points` edge function are all Supabase. The layering rules in `.claude/rules/architecture.md` stay: controllers call services, services call repositories, repositories are the only data access.

The DynamoDB key design, GSIs and read access patterns are in `docs/dynamodb-access-patterns.html` (Draft 2; the `docs/` folder is gitignored, so it is not in the repo). One table per aggregate, multi-attribute GSIs, per-user monthly counters. Decisions already made: single-tenant schema with no `tenant_id` in keys, UTC for every timestamp and period boundary, offset-style paging kept for the points breakdown and upload audit.

## Goals / Non-Goals

**Goals:**
- One `serverless.yml` that creates and removes a complete stage.
- Keep controllers, services, validation and error handling unchanged where they do not touch Supabase.
- Move authentication to the gateway so application code only reads verified claims.

**Non-Goals:**
- Re-deriving the access patterns. They are taken as given from the access-pattern doc, except where this change records a decision.
- Report ingestion. Replacing the multipart report upload (a file upload or an API that accepts per-agent and per-group-leader payloads) is a separate change, and the existing report routes are not carried over as-is.
- The old-report-file cleanup. There is no scheduler for `/internal/cleanup-old-report-files`; what happens to the endpoint is decided with the ingestion change.
- Per-route functions, provisioned concurrency or multi-region.
- Migrating Supabase data (greenfield) or running both backends side by side (big-bang cutover).

## Decisions

**Serverless Framework v4, installed as a project devDependency.** Run everything through `npx sls <command>`, never a global install, so the version is pinned by `package-lock.json` and CI uses the same one. Alternatives: AWS CDK or SAM (rejected: you chose `serverless.yml`), global install (rejected: version drift between machines).

**Single Express Lambda via a thin adapter.** `src/lambda.ts` wraps the existing Express `app` with `serverless-http` and replaces `main.ts` as the entry point. One `{proxy+}` HTTP API route keeps the route table in Express, so routers, middleware and OpenAPI stay as they are. Alternatives: one function per route (rejected: rewrites every router, duplicates cold starts), a container image Lambda (rejected: slower deploys, no benefit at this size).

**Cognito JWT authorizer on the HTTP API.** The user pool app client issues access tokens; the gateway verifies them and passes the claims, of which only `sub` is used. `Users.id` is the Cognito `sub`, and `authenticate` does one strongly consistent `GetItem` on `Users` for role, group and active status on every request. Token claims such as `cognito:groups` stay stale until the token refreshes, so a role change or deactivation would lag; the user pool therefore has no role groups. Deactivating a user also disables them in Cognito. Public routes (`/auth/register`, `/auth/login`, `/auth/login/verify`, health) declare no authorizer. Alternatives: an in-app JWT check as today (rejected: unverified requests would still invoke Lambda), a Lambda authorizer (rejected: extra function for no gain).

**Passwordless with Cognito's native email OTP.** The user pool lists `PASSWORD` and `EMAIL_OTP` as first auth factors (`Policies.SignInPolicy.AllowedFirstAuthFactors`), on the Essentials feature plan or higher, and the app client enables `ALLOW_USER_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` only. Cognito requires `PASSWORD` in that list (a dev deploy with only `EMAIL_OTP` was rejected), so passwordless is enforced by behaviour: register creates the user with a random permanent password that nobody is told, no route sets or resets a password, and the backend always requests the email-code challenge. No custom auth-challenge Lambdas are needed. Alternatives: the custom Define/Create/Verify auth-challenge triggers (rejected: three extra Lambdas to own for something Cognito does natively), SMS OTP (rejected: cost and weaker than email for this user base), passkeys (deferred: can be added later by adding `WEB_AUTHN` to the allowed factors).

**`/auth/*` proxies Cognito from the backend.** The service layer calls Cognito with the AWS SDK v3: `AdminCreateUser` with a verified email and `MessageAction: SUPPRESS`, followed by `AdminSetUserPassword` with a random permanent password, for register, `InitiateAuth` with `AuthFlow=USER_AUTH` and `PREFERRED_CHALLENGE=EMAIL_OTP` for `POST /auth/login`, `RespondToAuthChallenge` with the code for `POST /auth/login/verify`, and `GlobalSignOut` for logout. The agent-code check stays in the service. Enumeration is blocked by enabling `PreventUserExistenceErrors` on the app client, so an unknown email gets the same response shape as a known one. Forgot-password, reset-password and change-password disappear because there is no password; the frontend must adopt the two-step login.

**Two consumers on the Prospects stream, one on attendance.** Streams use `NEW_AND_OLD_IMAGES`. Two readers per shard is the comfortable limit, so Prospects gets exactly two: award-points and the stats recompute. CoachingAttendance gets award-points only. Every event source mapping uses `BisectBatchOnFunctionError`, a bounded retry count and an SQS on-failure destination. The old function always returned 200 and so lost failures; these must not.

**Award-points keeps the old edge function's rules, guarded by `AwardGuards`.** The function applies the old rules: prospect created, deleted (compensated by the negated total of positive points), appointment set, sales meeting, sale closed, and coaching attended, where the activity depends on the coaching type and the points are multiplied by the session duration in whole hours rounded up. The old idempotency check on `(subject_id, activity)` cannot run against the eventually consistent `bySubject` index, so one `TransactWriteItems` writes a guard item keyed by subject and activity (`attribute_not_exists`), the ledger row and the `PointTotals` increment. The guard stores user, points and subject type, so the prospect-deleted reversal reads it with a strongly consistent query instead. Coaching reads the session item for type and dates. Missing point configuration is logged as an error; the old function skipped it silently, which is a deliberate change.

**Stats recompute through an SQS FIFO queue.** The Prospects stream consumer forwards each changed agent id to a FIFO queue with `MessageGroupId = agent_id`. A second function re-queries the agent's prospects, recomputes every month bucket and writes or clears `UserStats` rows, so redelivery is harmless and per-agent order holds. Alternative: increment and decrement counters (rejected: needs transition logic and breaks on the `updated_at` fallback).

**UTC everywhere.** Timestamps are stored and returned as `YYYY-MM-DDTHH:mm:ss.sssZ`; month and year boundaries for counters, MTD and YTD are UTC; there is no timezone conversion. This matches what the leaderboard computes today, and the dashboard and group services run on UTC servers, so existing numbers do not change. Date-only and time-only fields are returned as stored. One shared period helper replaces three call sites.

**List behaviour changes at cutover.** `GET /prospects` for admins and master trainers is cursor-paginated through the `byStage` index (default limit 50, maximum 100, opaque `nextToken`, optional stage filter). Trainers see events they created, through the `byCreator` index. The coaching-session list returns attendance counts kept on the session item, and the detail view returns full attendance. The points breakdown and upload audit keep their page-and-limit API through offset emulation.

**Multi-attribute index keys work through `serverless.yml`.** Spike result (dev stage, `ap-southeast-5`, 2026-11-04): an index with a two-attribute partition key and a two-attribute sort key deployed through CloudFormation and became `ACTIVE` with all four key attributes. A query with every partition-key attribute returned the item; a query with only one of them was rejected (`HASH key attributes subject_id must have equality conditions`); an item missing the index key attributes stayed out of the index. The design's multi-attribute indexes and sparse indexes therefore stand. CloudFormation still cannot change a GSI key schema in place, so index keys are fixed before real data lands.

**Esbuild bundling through the framework.** Serverless v4 bundles TypeScript itself, so the `serverless-esbuild` and `serverless-offline` plugins from the reference repo are not adopted. Local runs use the existing Express dev server, not an emulator.

**Environment configuration through one module.** `src/utils/env.ts` stays the only reader of `process.env`. Per-stage values come from `serverless.yml` `provider.environment`, and Supabase and Vercel variables are removed. Every deployed stage runs with `NODE_ENV=production` and carries its name in `STAGE`. A first dev deploy with `NODE_ENV=development` crashed at startup because the development logger started a `pino-pretty` worker that cannot load from a bundle; that logger has since been removed (see below), but deployed stages stay on production mode, which enables helmet and restricts CORS to `ALLOWED_ORIGINS`, so that variable is required for every stage.

**Logging and Sentry are removed for now.** Pino, `LoggingService`, the request-logging middleware, the correlation ID, `morgan` and Sentry (error capture, metrics, tags, user context) are deleted, and the stack is AWS-only until the owner says otherwise. Handled errors leave no trace until a replacement (an AWS-native option or another package) is added in a separate change; the Lambda runtime still writes startup crashes to CloudWatch. The award-points requirements that say an error is logged (unconfigured activity, unknown coaching type, invalid duration) are kept as written and depend on that change.

## Risks / Trade-offs

- [Serverless v4 requires an account login or license key to run] → Confirm the terms before the first deploy; set `SERVERLESS_ACCESS_KEY` in CI. I have not verified the current licensing terms.
- [The report upload route cannot work on Lambda as written, because of the 6 MB synchronous payload limit] → It is out of scope here (see Non-Goals); the separate ingestion change replaces it before cutover, or the report routes ship disabled.
- [Joins and SQL functions disappear with Postgres] → The access-pattern doc settles which reads need a GSI or a precomputed item; keep it as the reference while repositories are rewritten.
- [The multi-attribute GSI shape may not deploy through CloudFormation, and a wrong index key means replacing the index] → Spike one index first (task 4.1); fall back to concatenated single-attribute keys if it does not deploy.
- [Counters lag the data by the stream and queue delay, so a dashboard read right after a prospect change can be stale] → Accept eventual consistency for dashboards and the leaderboard; reads of a single record stay strongly consistent.
- [About 25 tables and 30 indexes in one stack] → Define tables from a shared helper in `serverless.yml` and watch the CloudFormation resource and update limits at the first full deploy.
- [Frontend breaks on paginated prospects, counts-only coaching list and `Z` timestamps] → Include all three in the contract handed to the frontend before cutover.
- [Cold starts on a large bundle] → Bundle with esbuild, keep SDK clients outside the handler, measure before adding provisioned concurrency.
- [Big-bang cutover with no rollback to Supabase] → Deploy a staging stage first and run the full flow there; keep the old deployment untouched until the new one has served production traffic.
- [Frontend breaks on the two-step login, removed password routes and removed tenant claim] → Hand the frontend the changed contract in `openapi.yaml` before cutover.
- [Cognito's default email sender has a low daily limit, so sign-in codes would stop for users] → Configure SES as the email sender for staging and production and verify the sending identity before cutover.
- [Email OTP needs the Essentials feature plan or higher, which has its own cost] → Check current pricing before choosing the plan; the plan is set in `serverless.yml` as the user pool tier.
- [Because the pool must list `PASSWORD`, anyone with the public client id could try password sign-in directly against Cognito] → Every user's password is random and unknown, so it cannot be guessed; Cognito's built-in lockout applies; confirm on dev that a password sign-in attempt fails.
- [A user created by `AdminCreateUser` starts in a state that blocks sign-in until a password is set] → Register sets a random permanent password right after creation so the user is confirmed; verify on dev that a freshly registered user can sign in with an emailed code, and fall back to `SignUp` plus confirmation if not.
- [The seed and admin scripts create users with a password] → Rewrite `scripts/create-admin.js` and `scripts/bootstrap.js` to create passwordless Cognito users.

## Migration Plan

1. Install Serverless v4 as a devDependency and confirm `npx sls --version`.
2. Add `serverless.yml` with the API function, Cognito resources and the HTTP API; deploy a staging stage.
3. Land the DynamoDB tables and repositories from the access-pattern doc, then add the stream consumers and the list behaviour changes.
4. Verify the complete flow on staging, then deploy the production stage and switch the frontend over.
5. Rollback is repointing the frontend at the previous Vercel deployment, which stays up until the cutover is confirmed.
