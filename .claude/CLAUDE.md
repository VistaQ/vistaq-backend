# Project Overview
This repository is the backend API for a React/Vite frontend, moving from Express on Vercel with Supabase to AWS. The Express app runs as one Lambda behind an API Gateway HTTP API, data lives in DynamoDB (with Streams), and Cognito handles passwordless sign-in. Everything is defined in `serverless.yml` on Serverless Framework v4. The stack is AWS-only until the owner says otherwise. Supabase is being removed entirely: do not add Supabase code. Repositories not yet migrated still call it and fail on Lambda until they are rewritten (see the tasks in the OpenSpec change).

# Workflow
- Planned work lives in OpenSpec changes under `openspec/changes/`. The active change is `migrate-to-serverless-lambda`.
- `/opsx:explore` to think a problem through, `/opsx:propose` to create the artifacts, `/opsx:apply` to implement tasks, `/opsx:update` to change the artifacts, `/opsx:archive` when a change is finished. When scope changes during implementation, update the proposal, design and tasks in the same step.
- `/commit-organiser` is ONLY invoked by the user. Never commit automatically.
- The DynamoDB access-pattern design is `docs/dynamodb-access-patterns.html` (gitignored, so it exists only on the owner's machine).

# AWS and Serverless
- Serverless Framework is a devDependency. Run it as `npx sls <command>`, never globally.
- `npx sls` cannot run inside Claude Code's sandbox (the framework binary and login are blocked), so give the owner the exact `! npx sls ...` command to run.
- Deployed stages run with `NODE_ENV=production`; `ALLOWED_ORIGINS` and the other `${env:...}` values in `serverless.yml` must be non-empty in `.env`.
- Logging and error reporting are intentionally absent (see `.claude/rules/logging.md`). Do not add `console.*`, Pino, Sentry or other third-party services unless told.

# Verification
- The package manager is npm. `npm run verify` runs lint and type-check.
- After writing `.ts` files, run `npm run verify && sh .claude/hooks/verify-stamp.sh`. The Stop hook (`.claude/hooks/stop-gate.sh`) blocks the stop until the stamp matches the working tree, and checks added comments against `.claude/rules/comments.md`.
- ESLint is deliberately minimal: JS and typescript-eslint recommended (not type-checked, `tsc` covers types) plus prettier and a few targeted rules (layering, env access, `no-console`, type-only imports, and the promise rules for `src/`). Do not add custom plugins, per-folder override blocks or a suppressions baseline.
