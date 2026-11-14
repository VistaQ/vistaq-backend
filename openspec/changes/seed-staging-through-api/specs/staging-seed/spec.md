# Spec Delta

## Purpose

Defines how a demo data set is created on a non-production stage through the deployed API, how it is removed again, and what the seed may and may not touch.

## ADDED Requirements

### Requirement: The seed targets one non-production stage
The seed and reset commands SHALL require an explicit stage, SHALL read that stage's API address, user pool and tables from its deployed stack, and SHALL refuse to run against production.

#### Scenario: Production is refused
- **WHEN** the seed or reset command is given the production stage
- **THEN** it exits with an error before making any request

#### Scenario: No stage given
- **WHEN** the command runs without a stage
- **THEN** it exits with an error naming the missing option

### Requirement: Data enters through the API
The seed SHALL create groups, users, agent codes, prospects and their stage changes, events, coaching sessions, attendance and sales reports through the deployed API's own routes, acting as the role that owns each action, so the API's validation applies and the stream consumers derive points and statistics from the result. Only the first administrator, which no route can create, is written directly.

#### Scenario: A seeded agent signs in
- **WHEN** the seed has finished
- **THEN** each seeded user exists in both the user pool and the users table and can be signed in

#### Scenario: Derived data follows
- **WHEN** the seed has finished and the stream consumers have drained
- **THEN** seeded agents have point totals and monthly statistics produced by the consumers, not written by the seed

### Requirement: Seeding sends no email and leaves no known password
The seed SHALL create users without sending any invitation or sign-in code, and SHALL leave every seeded user with a random password nobody knows when it exits, whether it succeeds or fails.

#### Scenario: Users are created
- **WHEN** the seed creates users
- **THEN** no email is sent to any address

#### Scenario: The seed stops part way
- **WHEN** the seed fails after signing users in with temporary passwords
- **THEN** those passwords are replaced with random ones before it exits

### Requirement: The seed does not run twice over its own data
The seed SHALL refuse to start when seed data from an earlier run is present on the stage, and SHALL point to the reset command.

#### Scenario: Seeding an already seeded stage
- **WHEN** the seed runs on a stage that still holds seed users
- **THEN** it exits before creating anything and names the reset command

### Requirement: Reset removes the seed and nothing else
The reset command SHALL remove every user, record and derived row the seed created, including ledger, totals, statistics, guard, sales and report rows and the seed administrator, and SHALL leave every other user, record and setting exactly as it was. It SHALL find seed data even when the record of the run is missing.

#### Scenario: Stage restored
- **WHEN** reset finishes on a stage that was seeded from a known state
- **THEN** every table holds the same items as before the seed, and the user pool holds only the users it had before

#### Scenario: Real data survives
- **WHEN** reset runs on a stage that also holds users and records not created by the seed
- **THEN** none of those users, records or settings is changed or removed

#### Scenario: Run record lost
- **WHEN** reset runs and the record of the seed run is missing
- **THEN** it still finds the seed users and records by their seed markers and removes them
