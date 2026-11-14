# Spec Delta

## Purpose

Defines the per-agent monthly activity counters that the dashboard, group statistics and leaderboard read, and how they are kept correct as prospects change, replacing the Postgres aggregate functions.

## ADDED Requirements

### Requirement: Monthly counters per agent
The system SHALL keep, for each agent and each UTC calendar month, counters for prospects created, appointments set, appointments done, prospects in the sales stage, and sales completed with their total ACE. Month and year period boundaries SHALL be UTC.

#### Scenario: Prospect created late on the last day
- **WHEN** an agent's prospect is created at 23:30 UTC on the last day of a month
- **THEN** it counts in that month's bucket

#### Scenario: Period totals
- **WHEN** a reader asks for month-to-date or year-to-date totals
- **THEN** the totals equal the sum of the agent's monthly counters from the start of the current month or year

### Requirement: Counters follow prospect changes
The system SHALL recompute an agent's counters from that agent's prospects whenever one of them is created, changed or deleted, writing every month that has contributors and clearing any month that no longer has any.

#### Scenario: Appointment date moves to another month
- **WHEN** an agent's appointment date is changed from March to April
- **THEN** the March appointments-set counter drops by one and the April counter rises by one

#### Scenario: Prospect deleted
- **WHEN** an agent's only prospect for a month is deleted
- **THEN** that month's counters are cleared

### Requirement: Recompute is idempotent and ordered per agent
The system SHALL process changes for one agent one at a time and in order, and SHALL produce the same counters when a change is processed more than once.

#### Scenario: Redelivered change
- **WHEN** the same change is processed twice
- **THEN** the counters are identical to processing it once

#### Scenario: Two quick changes
- **WHEN** two changes for the same agent arrive back to back
- **THEN** the final counters reflect both changes

### Requirement: Recompute failures are kept
The system SHALL retry a failed recompute and send it to a dead-letter destination when retries are exhausted.

#### Scenario: Persistent failure
- **WHEN** a recompute fails after the configured retries
- **THEN** the message lands in the dead-letter destination and other agents are unaffected
