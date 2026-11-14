# Proposal

## Why

The unit tests still run on Jest with `ts-jest`, and nothing has run them since the move to Lambda, DynamoDB and Cognito. During that migration the tests were only edited to compile: today 6 of 31 suites fail (20 of 370 tests), and the stream consumers, coaching sessions, prospect pagination and activity stats have no tests at all. Several of the migration's own tasks deferred their unit tests to this change. With the migration archived and staging deploying through CI, this is the point to switch the runner to Vitest and make the suite cover the specified behaviour again before production work starts.

## What Changes

- Replace Jest and `ts-jest` with Vitest: add `vitest`, `@vitest/coverage-v8` and `vite`, a `vitest.config.mts`, and point `npm test`, `test:watch` and `test:coverage` at Vitest. Remove `jest`, `ts-jest`, `@types/jest`, `jest.config.js` and `tests/global-setup.ts`.
- Convert every test file to the Vitest API with explicit imports from `vitest`.
- Make the suite hermetic: fixed test environment values instead of `.env`, dummy AWS credentials, and AWS clients mocked with `aws-sdk-client-mock`.
- Repair or delete the tests that describe behaviour from before the migration, recording why for each deletion.
- Add the tests the migration deferred, including named regression tests for the defects it found.
- Run the tests in the staging deploy workflow before `npx sls deploy`, so a failing suite stops the deploy.

## Capabilities

### New Capabilities
- `test-suite`: how the automated tests run, what they may depend on, how they map to the specified behaviour, and how they gate deploys.

### Modified Capabilities

## Impact

- **Dependencies**: `vitest`, `@vitest/coverage-v8` and `vite` are added as devDependencies; `jest`, `ts-jest` and `@types/jest` are removed. `supertest` and `aws-sdk-client-mock` stay.
- **Code**: `package.json` scripts, `vitest.config.mts`, every file under `tests/`, `.github/workflows/staging.yml`. Application code under `src/` changes only where a test exposes a defect.
- **Docs**: the Verification section of `.claude/CLAUDE.md` gains `npm test`. The "no tests during the migration" instruction is retired.
- **Behaviour**: no API or deployment behaviour changes. A staging deploy now fails early when a test fails.
