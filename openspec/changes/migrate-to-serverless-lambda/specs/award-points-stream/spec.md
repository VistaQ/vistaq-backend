# Spec Delta

## Purpose

Defines how points are awarded to agents as a side effect of prospect and coaching-attendance changes, by consuming the DynamoDB stream instead of a database webhook.

## ADDED Requirements

### Requirement: Points follow data changes
The system SHALL award points from stream records of prospects and coaching-session attendance, using the activity rules of the previous edge function: prospect created, prospect deleted, appointment set, sales meeting held, sale closed, and coaching attended.

#### Scenario: Prospect created
- **WHEN** a prospect record is inserted
- **THEN** the prospect's owner receives the points configured for a created prospect

#### Scenario: Appointment set
- **WHEN** a prospect's appointment status changes to scheduled
- **THEN** the owner receives the appointment-set points once

#### Scenario: Sales meeting held
- **WHEN** a prospect's appointment status changes to done
- **THEN** the owner receives the sales-meeting points once

#### Scenario: Sale closed
- **WHEN** a prospect's sales completion time changes from unset to set
- **THEN** the owner receives the sale-closed points once

#### Scenario: Unrelated change
- **WHEN** a record changes in a way no activity rule matches
- **THEN** no points are awarded

### Requirement: Coaching points follow session type and duration
The system SHALL award coaching points when an attendance record is inserted with status joined or changes to joined. The activity SHALL depend on the session's coaching type (individual coaching, group coaching, peer circles, seminar), and the points SHALL be the configured points multiplied by the session duration in whole hours, rounded up.

#### Scenario: Group coaching, 90 minutes
- **WHEN** an agent joins a group coaching session that lasts 90 minutes
- **THEN** the agent receives the configured group-coaching points multiplied by 2

#### Scenario: Unknown coaching type
- **WHEN** an agent joins a session whose coaching type has no activity mapping
- **THEN** no points are awarded and a warning is logged

#### Scenario: Invalid duration
- **WHEN** an agent joins a session whose end time is not after its start time
- **THEN** no points are awarded and a warning is logged

### Requirement: Deleted prospects are compensated
The system SHALL, when a prospect is deleted, award its owner the negative of the total positive points previously awarded for that prospect, and SHALL award nothing when that total is not positive.

#### Scenario: Prospect with awards
- **WHEN** a prospect that earned 30 points in total is deleted
- **THEN** its owner receives a transaction of minus 30 points

#### Scenario: Prospect without awards
- **WHEN** a prospect that earned no points is deleted
- **THEN** no transaction is written

### Requirement: Idempotent awarding
The system SHALL award points for a given activity on a given subject at most once, including when the same stream record is delivered more than once or two deliveries run concurrently. For prospects the subject is the prospect; for coaching it is the attendance record.

#### Scenario: Redelivered record
- **WHEN** the same stream record is processed twice
- **THEN** exactly one point transaction exists for that activity and subject

#### Scenario: Concurrent delivery
- **WHEN** two workers process the same stream record at the same moment
- **THEN** exactly one of them writes a transaction and the other awards nothing

#### Scenario: Two attendees of one session
- **WHEN** two agents join the same coaching session
- **THEN** each receives their own award

### Requirement: Failures are retried and kept
The system SHALL retry a failed batch, isolate the failing record, and send records that still fail to a dead-letter destination instead of dropping them.

#### Scenario: Poison record
- **WHEN** one record in a batch cannot be processed after the configured retries
- **THEN** the other records are processed and the failing record lands in the dead-letter destination

#### Scenario: Transient failure
- **WHEN** a downstream call fails once and then succeeds
- **THEN** the record is processed and points are awarded once

### Requirement: Missing configuration is visible
The system SHALL log an error when no point configuration or activity type exists for an activity, and SHALL NOT award zero or default points. The previous edge function skipped these cases silently; this system reports them.

#### Scenario: Unconfigured activity
- **WHEN** an activity occurs that has no configured points
- **THEN** an error is logged with the activity name and no transaction is written
