# Spec Delta

## Purpose

Defines how the API and the AWS resources it needs are declared, packaged and deployed from a single `serverless.yml`, so an environment can be created, updated and removed from code alone.

## ADDED Requirements

### Requirement: Infrastructure is declared in serverless.yml
The system SHALL define every AWS resource it needs (functions, HTTP API, authorizer, user pool, table, stream mapping, queues and their permissions) in `serverless.yml`, with no resource created by hand.

#### Scenario: Fresh environment
- **WHEN** the deploy command is run for a stage that does not exist
- **THEN** all resources are created and the API answers its health check

#### Scenario: Removing a stage
- **WHEN** the remove command is run for a stage
- **THEN** the resources created for that stage are deleted

### Requirement: Single API function
The system SHALL serve every HTTP route from one Lambda function behind an API Gateway HTTP API, preserving the existing request and response contract of each route.

#### Scenario: Existing route
- **WHEN** a client calls an existing route with a valid request
- **THEN** it receives the same status code and body shape as before the migration

#### Scenario: Unknown route
- **WHEN** a client calls a path no route handles
- **THEN** it receives a 404 response

### Requirement: Stage-scoped configuration
The system SHALL read all configuration from environment variables set per stage in `serverless.yml`, and SHALL fail at cold start with a clear error when a required value is missing.

#### Scenario: Missing required value
- **WHEN** the function starts without a required environment variable
- **THEN** initialization fails and the error names the missing variable

### Requirement: Least-privilege permissions
The system SHALL grant each function only the IAM permissions its own code path needs.

#### Scenario: Stream consumer permissions
- **WHEN** the stream consumer attempts to read a table it has no grant for
- **THEN** the call is denied by IAM
