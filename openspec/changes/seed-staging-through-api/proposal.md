# Proposal

## Why

Staging runs the migrated stack but holds almost no data: one real admin, the reference activity types and placeholder point configs. The frontend team needs a realistic data set to build against, and that data should come in through the deployed API so it is validated, owned by real Cognito users who can sign in, and processed by the stream consumers exactly as production data will be. The existing `scripts/seed.ts` writes DynamoDB directly, so its users have no Cognito accounts and its records skip the API's rules.

## What Changes

- Add a repo script, `npm run seed:api -- --stage <stage>`, that builds a demo data set through the deployed HTTP API:
  - 5 groups with trainers, leaders and about 30 agents, plus a master trainer;
  - agent codes, a few hundred prospects moved through appointment and sales;
  - events and coaching sessions with joins;
  - monthly sales reports from January of the current year.
- The script talks to the API through a typed `openapi-fetch` client generated from `openapi.yaml`, so a change to the contract fails the seeder's type-check instead of failing at run time.
- Seed users have `seed-…@example.com` addresses and are signed in with temporary passwords set through the Cognito admin API; their passwords are randomised again before the script exits.
- A seed admin is created the way `create-admin.js` creates one, used for the admin calls, and removed by reset.
- Add `npm run seed:api:reset -- --stage <stage>`. It removes everything the seed created, including the rows the stream consumers derived, and leaves every other user, record and setting untouched.
- Add `npm run gen:api`, which regenerates the client types, and a test that fails when the committed types no longer match `openapi.yaml`.
- **Known limitation:** the API stamps the server's current time on prospects, stage changes, appointments, sales and attendance, and refuses event and coaching dates in the past. Unlike dev's direct seed, prospect activity therefore lands in the current month, and monthly dashboards and the leaderboard show one month of it. Only the sales reports cover earlier months.

## Capabilities

### New Capabilities
- `staging-seed`: how demo data is created on a non-production stage through the API and removed again, and what the seed may and may not touch.

### Modified Capabilities

## Impact

- **Dependencies**: `openapi-fetch` and `openapi-typescript` as devDependencies.
- **Code**: `scripts/seed-api/` (the client, the generated types, the seed and reset commands), `package.json` scripts, `.gitignore` (the run manifest replaces the stale `scripts/demo-seed-manifest.json` entry), tests for the reset scoping, the production refusal and the type drift.
- **Systems**: writes to the target stage's Cognito user pool and DynamoDB tables through the API and the AWS SDK. It needs AWS credentials for the Cognito admin calls and for reset, and never runs against production.
- **Behaviour**: no deployment change. The first dev run found that user-id fields (group leader, trainers and members, event and coaching agents, the agent-points filter) used Zod's RFC 4122 `uuid()`, which rejects Cognito subs. They now accept any 8-4-4-4-12 hex id through a shared `userIdSchema`.
