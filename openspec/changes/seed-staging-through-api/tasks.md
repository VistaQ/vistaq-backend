# Tasks

## 1. Generated client

- [x] 1.1 Add `openapi-fetch` 0.17.0 and `openapi-typescript` 7.13.0 as exact devDependencies and a `gen:api` script that writes Prettier-formatted types to `scripts/seed-api/api.d.ts`; commit the generated file, and add it to ESLint's global `ignores` only if lint flags it; verify `npm run gen:api` is repeatable (a second run leaves `git diff` empty) and `npm run verify` passes (done 2026-11-15: `gen:api` runs `scripts/seed-api/genTypes.ts`, which writes the output of the shared `generateApiTypes()` (openapi-typescript on `openapi.yaml`, then Prettier with the repo config) to `api.d.ts`, 7,517 lines; a second run is byte-identical; ESLint accepts the file as it is, so no `ignores` entry was added)
- [x] 1.2 Add `tests/unit/seedApi/apiTypes.test.ts`, which regenerates the types from `openapi.yaml` in memory and compares them with the committed file; verify it fails when a path is added to `openapi.yaml` temporarily, and passes again after restoring it (done 2026-11-15: the test calls the same `generateApiTypes()`; with a `/drift-check` path added it fails, and restored it passes)
- [x] 1.3 Add `scripts/seed-api/client.ts`: an `openapi-fetch` client per signed-in user over the stage's API URL, at most 3 requests in flight, with exponential backoff on 429 and 5xx; verify with mocked `fetch` that a 429 is retried and that more than 3 concurrent calls never run (done 2026-11-15: 7 tests also cover giving up after 5 attempts, no retry on a 4xx, one re-sign-in after a 401 with a fresh token only for that attempt, and the same body resent; with retries switched off 3 fail, and without the limit the concurrency test fails)

## 2. Stage and sign-in

- [x] 2.1 Add `scripts/seed-api/stage.ts`, which resolves `--stage` to the API URL, `UserPoolId`, `UserPoolClientId` and table names from the `vistaq-<stage>` stack, refusing a missing stage, `production`, and any stack whose tables start `prod_`; verify with `tests/unit/seedApi/stage.test.ts` against a mocked CloudFormation client (done 2026-11-15: service name and region come from `serverless.yml`; outputs from `DescribeStacks`, tables from a paginated `ListStackResources`, keyed by the `<Base>Table` logical ids, with one shared prefix required. 10 tests; removing the `prod_` prefix guard or the production name guard each fails one. Added `@aws-sdk/client-cloudformation` 3.1161.0, matching the other SDK clients)
- [x] 2.2 Add `scripts/seed-api/auth.ts`:
  - create the seed admin as `create-admin.js` does (`AdminCreateUser` with `SUPPRESS`, and the Users item);
  - set the run's temporary password with `AdminSetUserPassword` and sign in with `USER_AUTH` and `PASSWORD`, signing in again on a 401;
  - in `finally` and on `SIGINT`, re-randomise every user it touched.

  Verify with `tests/unit/seedApi/auth.test.ts` that no create call omits `SUPPRESS` and that a thrown error still re-randomises every touched user. Done 2026-11-15: `SeedAuth` with `createSeedAdmin`, `tokenFor` and `run`; a user counts as touched before its password is set, so a failed sign-in is still restored. 7 tests, including Ctrl+C through the registered handler; without the restore on failure 2 fail, without `SUPPRESS` 1 fails.

## 3. Seed and reset commands

- [x] 3.1 Add `scripts/seed-api/plan.ts`, which builds the deterministic demo plan from a fixed faker seed (users, groups, codes, prospects with target stages, events, sessions and joins in the coming weeks, monthly reports from January to last month) with the seed markers; verify with `tests/unit/seedApi/plan.test.ts` that the same seed gives the same plan, that every user, group, code and title carries its marker, and that every event and session starts in the future (done 2026-11-15: a local seeded `Faker` and an explicit `now`; request bodies are typed from `api.d.ts`. The plan holds 1 master trainer, 3 trainers, 5 groups, 30 agents (one leader per group), 40 codes, 295 prospects (655 requests), 8 events, 8 sessions with 19 joins, and reports for January to last month. Trainers aim events and sessions only at their own groups, and agents carry sales, FYCT and FYC targets. 6 tests, which also check owners and that YTD equals the sum of the monthly figures)
- [x] 3.2 Add `scripts/seed-api/seed.ts` and `npm run seed:api -- --stage <stage>`:
  - refuse when seed users already exist on the stage;
  - create the data in dependency order as the owning role;
  - write the run record to `scripts/seed-api/.runs/<stage>.json`, replacing the stale `scripts/demo-seed-manifest.json` entry in `.gitignore` with `scripts/seed-api/.runs/`.

  Verify with `tests/unit/seedApi/seed.test.ts` that an existing seed user stops the run before any create call. Done 2026-11-15:
  - The order is the seed admin, trainers, codes, groups with trainers, registration, profiles and targets, leaders, prospects, events, sessions, joins, then reports in month order.
  - One owner's prospects and joins run in sequence, with parallelism across owners. Parallel work waits for every task before passwords are restored.
  - The run record is saved after every create, and a report that skips rows stops the run.
  - Uploads are resent on a 409, because the upload guard reads an index, and the Cognito client uses adaptive retries for the burst of first sign-ins.
  - `auth.ts` now shares one sign-in among parallel requests and refuses sign-ins once passwords are restored. `stage.ts` also returns the stack's queue URLs.
  - 5 seed tests:
    - a seed user or a leftover record stops the run before any create or fetch, and an address the filter matches that isn't a seed user does not (without the check, 2 fail);
    - the 409 resend retries, gives up after 4 attempts, and leaves other statuses alone.
  - 2 new auth tests: without the shared sign-in 1 fails, and without the refusal 1 fails.
- [x] 3.3 Add `scripts/seed-api/reset.ts` and `npm run seed:api:reset -- --stage <stage> [--dry-run]`:
  - select seed items by run-record ids, or by markers when the record is missing;
  - delete them by key;
  - wait for the queues to drain and sweep every table again until no item references a seed id;
  - delete the seed users from Cognito.

  Verify with `tests/unit/seedApi/reset.test.ts` that unrelated items (a real admin, activity types, point configs) are never selected, and that the sweep repeats until a pass finds nothing. Done 2026-11-15, with the design updated:
  - Reset combines the run record, the seed users' subs and the markers.
  - Records count as seed data by identity, links by their parent, and derived rows by key or owner field.
  - Real records that mention a seed id are reported, not deleted. That includes a real event's link to a seed group.
  - Deletes run stream sources first, then derived rows, then the rest, with Cognito last.
  - It waits only on the stats queue and reports any growth in the failure queues.
  - "Clean" is two quiet passes in a row.
  - 6 tests. Selecting by any mention fails 2, dropping the parent rule for links fails 2, one quiet pass fails 1, and no settle after the stream sources fails 1.
- [x] 3.4 Add `scripts/seed-api/snapshot.ts` (`save` and `diff` of every table on a stage, keyed by each table's key schema) for verifying live runs; verify `diff` right after `save` reports no change (done 2026-11-15: `npm run seed:api:snapshot -- save|diff --stage <stage>`. The snapshot also holds the pool's usernames, so the user checks in 4.1 and 4.3 are part of the diff, and it is written to the gitignored `.runs/`. Key lookup is shared with reset through `tables.ts`. 2 tests: no change after a save, even with sets reordered (unsorted sets fail it), and added, changed and pool users reported)

## 4. Live runs and docs

- [ ] 4.1 On dev: snapshot, seed, then reset, and diff against the snapshot; verify the diff is empty and the user pool holds the same users as before
- [ ] 4.2 On staging: snapshot, then seed; verify through the API as the seed admin that the planned counts of groups, users, prospects, events and sessions exist, that a seeded agent can sign in, and that after the queues drain the seeded agents have point totals and monthly statistics from the consumers
- [ ] 4.3 On staging: reset, and diff against the 4.2 snapshot; verify the diff is empty and the pool holds only the users it had before. Then seed again so the frontend team has the data, and record the counts
- [ ] 4.4 Document `seed:api`, `seed:api:reset` and `gen:api` in the README (including the current-month limitation), and add `npm test` and `npm run verify` results; verify `npm test` and `npm run verify` pass

## Workflow follow-up

- Raising the account's Lambda concurrency limit (10 in ap-southeast-5) belongs with the production change.
- Archive with `/opsx:archive` after group 4.
