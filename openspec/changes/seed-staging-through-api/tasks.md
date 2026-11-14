# Tasks

## 1. Generated client

- [ ] 1.1 Add `openapi-fetch` 0.17.0 and `openapi-typescript` 7.13.0 as exact devDependencies and a `gen:api` script that writes Prettier-formatted types to `scripts/seed-api/api.d.ts`; commit the generated file, and add it to ESLint's global `ignores` only if lint flags it; verify `npm run gen:api` is repeatable (a second run leaves `git diff` empty) and `npm run verify` passes
- [ ] 1.2 Add `tests/unit/seedApi/apiTypes.test.ts`, which regenerates the types from `openapi.yaml` in memory and compares them with the committed file; verify it fails when a path is added to `openapi.yaml` temporarily, and passes again after restoring it
- [ ] 1.3 Add `scripts/seed-api/client.ts`: an `openapi-fetch` client per signed-in user over the stage's API URL, at most 3 requests in flight, with exponential backoff on 429 and 5xx; verify with mocked `fetch` that a 429 is retried and that more than 3 concurrent calls never run

## 2. Stage and sign-in

- [ ] 2.1 Add `scripts/seed-api/stage.ts`, which resolves `--stage` to the API URL, `UserPoolId`, `UserPoolClientId` and table names from the `vistaq-<stage>` stack, refusing a missing stage, `production`, and any stack whose tables start `prod_`; verify with `tests/unit/seedApi/stage.test.ts` against a mocked CloudFormation client
- [ ] 2.2 Add `scripts/seed-api/auth.ts`:
  - create the seed admin as `create-admin.js` does (`AdminCreateUser` with `SUPPRESS`, and the Users item);
  - set the run's temporary password with `AdminSetUserPassword` and sign in with `USER_AUTH` and `PASSWORD`, signing in again on a 401;
  - in `finally` and on `SIGINT`, re-randomise every user it touched.

  Verify with `tests/unit/seedApi/auth.test.ts` that no create call omits `SUPPRESS` and that a thrown error still re-randomises every touched user.

## 3. Seed and reset commands

- [ ] 3.1 Add `scripts/seed-api/plan.ts`, which builds the deterministic demo plan from a fixed faker seed (users, groups, codes, prospects with target stages, events, sessions and joins in the coming weeks, monthly reports from January to last month) with the seed markers; verify with `tests/unit/seedApi/plan.test.ts` that the same seed gives the same plan, that every user, group, code and title carries its marker, and that every event and session starts in the future
- [ ] 3.2 Add `scripts/seed-api/seed.ts` and `npm run seed:api -- --stage <stage>`:
  - refuse when seed users already exist on the stage;
  - create the data in dependency order as the owning role;
  - write the run record to `scripts/seed-api/.runs/<stage>.json`, replacing the stale `scripts/demo-seed-manifest.json` entry in `.gitignore` with `scripts/seed-api/.runs/`.

  Verify with `tests/unit/seedApi/seed.test.ts` that an existing seed user stops the run before any create call.
- [ ] 3.3 Add `scripts/seed-api/reset.ts` and `npm run seed:api:reset -- --stage <stage> [--dry-run]`:
  - select seed items by run-record ids, or by markers when the record is missing;
  - delete them by key;
  - wait for the queues to drain and sweep every table again until no item references a seed id;
  - delete the seed users from Cognito.

  Verify with `tests/unit/seedApi/reset.test.ts` that unrelated items (a real admin, activity types, point configs) are never selected, and that the sweep repeats until a pass finds nothing.
- [ ] 3.4 Add `scripts/seed-api/snapshot.ts` (`save` and `diff` of every table on a stage, keyed by each table's key schema) for verifying live runs; verify `diff` right after `save` reports no change

## 4. Live runs and docs

- [ ] 4.1 On dev: snapshot, seed, then reset, and diff against the snapshot; verify the diff is empty and the user pool holds the same users as before
- [ ] 4.2 On staging: snapshot, then seed; verify through the API as the seed admin that the planned counts of groups, users, prospects, events and sessions exist, that a seeded agent can sign in, and that after the queues drain the seeded agents have point totals and monthly statistics from the consumers
- [ ] 4.3 On staging: reset, and diff against the 4.2 snapshot; verify the diff is empty and the pool holds only the users it had before. Then seed again so the frontend team has the data, and record the counts
- [ ] 4.4 Document `seed:api`, `seed:api:reset` and `gen:api` in the README (including the current-month limitation), and add `npm test` and `npm run verify` results; verify `npm test` and `npm run verify` pass

## Workflow follow-up

- Raising the account's Lambda concurrency limit (10 in ap-southeast-5) belongs with the production change.
- Archive with `/opsx:archive` after group 4.
