# test-suite Specification

## Purpose

Defines how the backend's automated tests are run, what they may depend on, how they trace back to the specified behaviour, and how they gate a deploy.

## Requirements

### Requirement: One command runs the whole suite
The project SHALL provide `npm test`, which runs every test file once and exits non-zero when any test fails, `npm run test:watch`, which reruns affected tests on change, and `npm run test:coverage`, which runs the suite once and reports line and branch coverage for `src/`.

#### Scenario: All tests pass
- **WHEN** `npm test` runs on a clean checkout after `npm ci` and every test passes
- **THEN** it exits with status 0

#### Scenario: A test fails
- **WHEN** any single test fails
- **THEN** `npm test` exits with a non-zero status and names the failing test and file

#### Scenario: Coverage report
- **WHEN** `npm run test:coverage` runs
- **THEN** it prints line and branch coverage for the files under `src/`

### Requirement: Tests are hermetic
The suite SHALL run without a `.env` file, without real cloud credentials and without network access. Configuration the application reads at import is supplied by the test setup, and every call the code would make to a cloud service is answered by an in-process stub.

#### Scenario: No `.env` file
- **WHEN** the suite runs in a checkout that has no `.env` file
- **THEN** every test that passes with a `.env` file also passes without one

#### Scenario: No network
- **WHEN** the suite runs on a machine with no network access and no cloud credentials
- **THEN** it completes with the same results, and no test waits on a network timeout

#### Scenario: An unstubbed cloud call
- **WHEN** code under test calls a cloud service that the test did not stub
- **THEN** the test fails quickly with an error naming the call, instead of reaching a real endpoint

### Requirement: Specified behaviour is traced to tests
Every requirement in `openspec/specs/` SHALL be exercised by at least one automated test, and each defect found and fixed in the code SHALL keep a regression test that fails if the defect returns. A requirement whose observable part depends on infrastructure not yet built (such as logging) is exercised for the part that exists, and the gap is recorded.

#### Scenario: A requirement without a test
- **WHEN** every requirement in `openspec/specs/` is checked against the test files
- **THEN** every requirement maps to at least one existing test file

#### Scenario: A fixed defect returns
- **WHEN** the change that fixed a recorded defect is reverted
- **THEN** that defect's regression test fails

### Requirement: Tests gate the staging deploy
The staging deploy workflow SHALL run the full suite after installing dependencies and before deploying, and SHALL not deploy when the suite fails.

#### Scenario: Failing suite
- **WHEN** a push to `staging` contains a failing test
- **THEN** the workflow stops at the test step and the stack is not updated

#### Scenario: Passing suite
- **WHEN** every test passes
- **THEN** the workflow continues to the deploy step
