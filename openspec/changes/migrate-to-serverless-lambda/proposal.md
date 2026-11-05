# Proposal

## Why

The backend runs as a long-lived Express server on Vercel, backed by Supabase (Postgres, Auth, an edge function). We are moving to AWS so that compute, data and identity are one platform defined as code: Lambda for compute, DynamoDB for data, Cognito for sign-up and sign-in. This is greenfield, so there is no Supabase data to carry over, and the cutover is a single big-bang release.

## What Changes

- Run the existing Express app inside one Lambda behind an API Gateway HTTP API, keeping the Controller/Service/Repository layers.
- Define every AWS resource (functions, HTTP API, authorizer, Cognito user pool, DynamoDB table, stream mapping, queues) in `serverless.yml` on Serverless Framework v4.
- Replace Supabase Auth with Cognito, passwordless: users sign in with a one-time code emailed by Cognito. `/auth/*` proxies Cognito from the backend; protected routes are authorized at the gateway by a Cognito JWT authorizer.
- Replace the Supabase `award-points` edge function and its database webhooks with two Lambda consumers of the DynamoDB streams: award-points, guarded so a redelivered record never awards twice, and a per-agent stats recompute that replaces the Postgres aggregate functions.
- Replace the Supabase data layer with DynamoDB, using the access-pattern design in `docs/dynamodb-access-patterns.html` (Draft 2). Role, group and active status are read from the user record on every request; the Cognito token only identifies the caller.
- Store and return every timestamp in UTC, with month and year boundaries in UTC.
- Remove Supabase, Vercel and the `tenant_id` claim from the runtime.
- Remove all application logging and Sentry: Pino, `LoggingService`, the request-logging middleware, the correlation ID, `morgan`, and `@sentry/node` with its metrics, tags and user context. The stack is AWS-only until the owner says otherwise, and a replacement is a separate change.
- **BREAKING** for observability: handled errors leave no trace until a replacement exists. Only Lambda startup crashes and platform errors reach CloudWatch.
- **BREAKING**: the tenant claim and `X-Tenant-Slug` lookup disappear (single-tenant, already decided); login becomes two steps (`POST /auth/login` then `POST /auth/login/verify`); `/auth/forgot-password`, `/auth/reset-password` and change-password are removed; register no longer takes a password.
- **BREAKING**: `GET /prospects` for admins and master trainers is cursor-paginated (`limit`, `nextToken`); the coaching-session list returns attendance counts instead of embedded attendance rows; timestamps come back with a `Z` suffix instead of an offset.
- Behaviour fix: trainers see the events they created.
- Add a faker-based seeder that fills the DynamoDB tables with development data once the tables, repositories and stream consumers exist, replacing the old Supabase and Firebase seed scripts.
- Supabase is dropped entirely, with no hybrid period: a route that still calls an unmigrated Supabase repository fails on Lambda until that repository is rewritten.

## Capabilities

### New Capabilities

- `serverless-deployment`: how the API, its resources and its stages are defined, packaged and deployed from `serverless.yml`.
- `cognito-authentication`: passwordless sign-up and sign-in by emailed code, sign-out, and request authorization backed by Cognito.
- `award-points-stream`: points are awarded from DynamoDB stream records, idempotently and with failure handling.
- `activity-stats`: per-agent monthly counters kept correct as prospects change, read by the dashboard, group stats and leaderboard.
- `record-listing`: how the prospect, event and coaching-session lists page and scope their results.

### Modified Capabilities

<!-- None: openspec/specs/ is empty, so every capability here is new. -->

## Impact

- Code: `src/lambda.ts` is the Lambda entry point (`src/main.ts` stays for local development); `src/middleware/auth.ts` reads the verified token subject and loads the user record; all repositories and `supabase.service.ts` replaced by DynamoDB access (task group 4); `src/services/auth.service.ts` calls Cognito instead of Supabase Auth.
- Removed: `supabase/` (101 migrations, edge function), Vercel config and build scripts, the Supabase client and `SUPABASE_*` env vars, the logging service and its call sites, `scripts/seed-test-data.js`, Sentry and its seed script, and the `pino`, `pino-pretty`, `morgan` and `@sentry/node` dependencies.
- Added: `scripts/seed.ts` with an `npm run seed` script, `serverless.yml`, an AWS SDK v3 dependency set, a Lambda adapter for Express, esbuild bundling via Serverless v4.
- Open API contract: unchanged except for the breaking items above; `openapi.yaml` must be updated.
- Out of scope: report ingestion (a separate change replaces the multipart upload with a file upload or an API taking per-agent and per-group-leader payloads), so the sales-report, upload-batch, report-job and sales-award tables are provisional. The cleanup scheduler for old report files is dropped.
