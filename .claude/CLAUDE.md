# Project Overview
This repository is the backend API for a React/Vite frontend, on AWS. The Express app runs as one Lambda behind an API Gateway HTTP API, data lives in DynamoDB (its streams feed the award-points and stats functions), report files live in S3, and Cognito handles passwordless sign-in. Everything is defined in `serverless.yml` on Serverless Framework v4. The stack is AWS-only until the owner says otherwise; Supabase has been removed, so do not add it back.

# Workflow
- Planned work lives in OpenSpec changes under `openspec/changes/`. The active change is `migrate-to-serverless-lambda`.
- `/opsx:explore` to think a problem through, `/opsx:propose` to create the artifacts, `/opsx:apply` to implement tasks, `/opsx:update` to change the artifacts, `/opsx:archive` when a change is finished. When scope changes during implementation, update the proposal, design and tasks in the same step.
- `/commit-organiser` is ONLY invoked by the user. Never commit automatically.
- The DynamoDB access-pattern design is `docs/dynamodb-access-patterns.html` (gitignored, so it exists only on the owner's machine).

# AWS and Serverless
- Serverless Framework is a devDependency. Run it as `npx sls <command>`, never globally.
- `npx sls` cannot run inside Claude Code's sandbox (the framework binary and login are blocked), so give the owner the exact `! npx sls ...` command to run.
- There is no `NODE_ENV` or production/development switch: helmet always runs. CORS is configured on the HTTP API (`provider.httpApi.cors`) from the per-stage `allowedOrigins` param, not in Express; a new stage needs that param. The only `${env:...}` values left, `ETL_SERVICE_URL` and `ETL_API_KEY`, are optional; while `ETL_API_KEY` is unset every key-authenticated internal route answers 401.
- Logging and error reporting are intentionally absent (see `.claude/rules/logging.md`). Do not add `console.*`, Pino, Sentry or other third-party services unless told.

# Verification
- The package manager is npm. `npm run verify` runs lint and type-check.
- After writing `.ts` files, run `npm run verify && sh .claude/hooks/verify-stamp.sh`. The Stop hook (`.claude/hooks/stop-gate.sh`) blocks the stop until the stamp matches the working tree, and checks added comments against `.claude/rules/comments.md`.
- ESLint is deliberately minimal: JS and typescript-eslint recommended (not type-checked, `tsc` covers types) plus prettier and a few targeted rules (layering, env access, `no-console`, type-only imports, and the promise rules for `src/`). Do not add custom plugins, per-folder override blocks or a suppressions baseline.
