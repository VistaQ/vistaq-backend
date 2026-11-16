# Spec Delta

## Purpose

Defines how the prospect, event and coaching-session list endpoints page and scope their results, including the three behaviours that change when the data layer moves to DynamoDB.

## ADDED Requirements

### Requirement: Prospect list is paginated
The system SHALL return the prospect list for admins and master trainers one page at a time, most recently updated first, accepting a `limit` and an opaque `nextToken` and returning a `nextToken` while more results exist. It SHALL accept an optional stage filter.

#### Scenario: First page
- **WHEN** an admin requests the prospect list without a token
- **THEN** the response contains at most the page limit of prospects and a `nextToken` when more exist

#### Scenario: Next page
- **WHEN** the admin repeats the request with the returned `nextToken`
- **THEN** the response continues after the last prospect already returned, with no repeats or gaps

#### Scenario: Stage filter
- **WHEN** the admin requests a single stage
- **THEN** only prospects in that stage are returned

#### Scenario: Last page
- **WHEN** no prospects remain
- **THEN** the response contains no `nextToken`

#### Scenario: Limit above the maximum
- **WHEN** a request asks for a limit above the maximum
- **THEN** the system rejects it with a 400 validation error

### Requirement: Trainers see events they created
The system SHALL include in a trainer's event list the events the trainer created, in addition to events that target a group the trainer manages or target the trainer.

#### Scenario: Own event without targets
- **WHEN** a trainer creates an event that targets none of their groups and then lists events
- **THEN** the event appears in the list

#### Scenario: Another trainer's event
- **WHEN** a trainer lists events and another trainer's event targets only groups the first does not manage
- **THEN** that event is not in the list

### Requirement: Coaching list returns attendance counts only
The system SHALL return, for each session in the coaching-session list, the number of attendance records and the number that joined, and SHALL NOT embed the attendance records. The session detail SHALL return the full attendance.

#### Scenario: List item
- **WHEN** a client lists coaching sessions
- **THEN** each session has `attendance_total` and `attendance_joined` and no attendance records

#### Scenario: Detail view
- **WHEN** a client requests one session
- **THEN** the response includes every attendance record

#### Scenario: Counts stay current
- **WHEN** an agent's attendance status changes to joined
- **THEN** the session's `attendance_joined` count increases by one
