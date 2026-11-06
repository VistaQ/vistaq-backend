# Spec Delta

## Purpose

Defines how users register, sign in without a password, sign out, and how API requests are authenticated and attributed to a user and role, using Cognito email one-time codes behind the `/auth/*` routes.

## ADDED Requirements

### Requirement: Registration with agent code
The system SHALL create a passwordless Cognito user through `POST /auth/register` only when the supplied agent code is valid and unused, with a verified email address, and SHALL store a user record keyed by the Cognito subject that holds the user's application role and group. The request SHALL NOT accept a password.

#### Scenario: Valid registration
- **WHEN** a client registers with a new email and an unused agent code
- **THEN** the user is created, the agent code is marked used, and the response contains the new user without any token

#### Scenario: Invalid agent code
- **WHEN** a client registers with an invalid or already used agent code
- **THEN** the system rejects the request and creates no user

#### Scenario: Duplicate email
- **WHEN** a client registers with an email that already exists
- **THEN** the system rejects the request with a conflict error

### Requirement: Sign-in starts with an emailed code
The system SHALL start sign-in through `POST /auth/login` with an email address by sending a one-time code to that address and returning an opaque session value for the next step.

#### Scenario: Known email
- **WHEN** a client submits the email of a registered user
- **THEN** a code is emailed to that user and the response contains a session value

#### Scenario: Unknown email
- **WHEN** a client submits an email with no account
- **THEN** the response has the same status and shape as for a known email and no email is sent

### Requirement: Sign-in completes with the code
The system SHALL complete sign-in through `POST /auth/login/verify` by accepting the email, session value and code, and returning the tokens Cognito issues.

#### Scenario: Correct code
- **WHEN** a client submits the correct code with its session value
- **THEN** the response contains an access token and a refresh token

#### Scenario: Wrong or expired code
- **WHEN** a client submits an incorrect or expired code
- **THEN** the system returns an authentication error and no tokens

#### Scenario: Reused session
- **WHEN** a client submits a code with a session value that already completed sign-in
- **THEN** the system rejects the request

### Requirement: No password credentials
The system SHALL NOT offer password login, password reset or password change, and SHALL remove those routes from the API contract.

#### Scenario: Removed routes
- **WHEN** a client calls `/auth/forgot-password`, `/auth/reset-password` or the change-password route
- **THEN** the system returns 404

### Requirement: Logout revokes the session
The system SHALL invalidate the caller's tokens through `POST /auth/logout`: it signs the user out of Cognito and records the sign-out time on the user record, and the application SHALL reject any access token issued at or before that time, because the gateway authorizer checks only signature and expiry.

#### Scenario: Revoked tokens
- **WHEN** a client logs out and then calls a protected route with the old access token
- **THEN** the call is rejected as unauthorized

### Requirement: Gateway-level authorization
The system SHALL reject requests to protected routes that lack a valid Cognito access token before they reach application code, and SHALL leave the health check, `/openapi.yaml`, `/api/auth/register`, `/api/auth/login`, `/api/auth/login/verify` and `/api/public/*` public. The `/api/internal/*` routes SHALL also bypass the gateway authorizer because they authenticate in the application with an API key.

#### Scenario: Missing token
- **WHEN** a client calls a protected route without a token
- **THEN** the request is rejected with 401 and the function is not invoked

#### Scenario: Public route
- **WHEN** a client calls `POST /api/auth/login` without a token
- **THEN** the request reaches the function

#### Scenario: Internal route
- **WHEN** a caller invokes an `/api/internal/*` route with a valid API key and no Cognito token
- **THEN** the request is accepted by the application

### Requirement: CORS is answered at the gateway
The HTTP API SHALL answer CORS preflight (`OPTIONS`) requests itself from the stage's allowed origins, without invoking the function, and SHALL add the CORS headers to responses only for those origins.

#### Scenario: Preflight request
- **WHEN** a browser on an allowed origin sends an `OPTIONS` preflight for a protected route without a token
- **THEN** API Gateway answers it with the CORS headers and the function is not invoked

#### Scenario: Origin not allowed
- **WHEN** a browser on an origin outside the stage's list calls the API
- **THEN** the response carries no `Access-Control-Allow-Origin` for that origin, so the browser blocks it

### Requirement: Authenticated user context
The system SHALL identify the caller by the subject of the verified token, and SHALL read the caller's role, group and active status from the user record on every request. It SHALL NOT take role or group from token claims, and SHALL authorize role-restricted routes by the stored role.

#### Scenario: Role-restricted route
- **WHEN** a user whose role is not permitted calls a role-restricted route
- **THEN** the system returns 403

#### Scenario: Current user
- **WHEN** an authenticated client calls `GET /auth/me`
- **THEN** the response identifies that user and their stored role

#### Scenario: Role changed after sign-in
- **WHEN** an admin changes a user's role and that user calls a role-restricted route with their existing token
- **THEN** the new role applies to that request

#### Scenario: Deactivated user with a valid token
- **WHEN** a user is deactivated and then calls a protected route with a token that has not expired
- **THEN** the request is rejected with 403 and the message "Account is inactive"

#### Scenario: Token without a user record
- **WHEN** a request carries a valid token whose subject has no user record
- **THEN** the request is rejected as unauthorized
