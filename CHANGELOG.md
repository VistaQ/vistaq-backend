# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-04-11

Complete platform migration from Firebase/Firestore to Supabase (Postgres). Ground-up rewrite of the backend with new architecture, gamification system, coaching sessions, and full observability.

### Added

- **Supabase Integration** — `SupabaseService` singleton with CRUD wrappers, RLS-scoped and admin (service role) methods, database migrations, and CLI tooling
- **Authentication System** — `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` with JWT verification via Supabase Auth, custom claims (`user_id`, `tenant_id`, `app_role`), and RLS policies
- **Password Reset API** — `POST /auth/password-reset` with validation
- **Change Password API** — `PATCH /api/users/me/password` with password strength validation (PR #40)
- **User Management API** — Full CRUD: `POST /users`, `GET /users`, `PUT /users/:userId`, `DELETE /users/:userId` with tenant scoping and agent self-update
- **Group Management API** — `POST /groups`, `GET /groups`, `GET /groups/:groupId`, `PUT /groups/:groupId` with multi-trainer support
- **Public Groups Endpoint** — `GET /api/public/groups` (no auth required)
- **Prospect Management API** — Full CRUD with tenant scoping, check constraints for `appointment_status` and `sales_outcome`
- **Event Management API** — Full CRUD with end date, event type, `event_agents` junction table, and `agentIds`/`groupIds` sharing (Issue #4)
- **Dashboard Stats API** — `GET /dashboard/stats` with pre-aggregated YTD/MTD metrics and role-based scoping (Issue #3)
- **Gamification System** — `point_configs` and `point_transactions` tables, `award-points` Supabase Edge Function, configurable point rules (Issue #5, PR #30)
- **Point Configs API** — `GET /api/point-configs`, `POST /api/point-configs`, `PUT /api/point-configs/:id`
- **Point Activity Types API** — `GET /api/point-activity-types` with DB-driven labels
- **Leaderboard API** — `GET /api/leaderboard` with `get_agent_leaderboard` RPC function
- **Leaderboard Stats API** — `GET /api/leaderboard/stats?period=mtd|ytd` with global rankings bypassing RLS, pre-computed `total_points` (Issues #27, #29, PR #30, #31)
- **Agent Points API** — `GET /api/agent-points` with per-agent point breakdown
- **Coaching Sessions API** — Full CRUD with attendance tracking, ISO 8601 `start_date`/`end_date`, `InvalidDateRangeError` domain error, and per-coaching-type point awarding (Issues #16, #17, PR #35)
- **Coaching Points — Hourly Rate** — Points calculated as `hourly_rate x ceil(duration_hours)` instead of flat per-session (Issue #38, PR #37)
- **Sentry Observability** — Error tracking, tracing, dual-write logs (Pino + Sentry), correlation ID tagging, error fingerprinting via `getRootCause()`, custom metrics (service-layer spans, DB query duration, HTTP metrics), and `seed-sentry-metrics.ts` script (PR #36)
- **Logging** — Pino with `AsyncLocalStorage` correlation ID propagation, request/response middleware
- **Maintenance Mode** — `MAINTENANCE_MODE` env var; returns `503` for all routes except `/health`, toggleable via Vercel env vars (PR #41)
- **CI/CD** — Production workflow aligned with staging: Supabase project linking, database migrations, and Edge Functions deployment (PR #39)
- **OpenAPI Documentation** — Full spec for all endpoints
- **Health Endpoint** — `GET /health` following layered architecture

### Changed

- **Platform** — Migrated from Firebase/Firestore to Supabase (Postgres)
- **Project Structure** — Flattened from `api/` subdirectory to root
- **Logging** — Replaced Morgan with Pino; added Sentry dual-write
- **Coaching Types** — Consolidated seminar coaching types into a single seminar type
- **Award Points Detection** — `appointment_set` now fires on status transition to `scheduled` instead of `appointment_date` null-to-set
- **Point Activity Labels** — Replaced hardcoded `ACTION_DISPLAY_NAMES` with DB-driven `point_activity_types` lookup
- **Edge Function Imports** — Migrated `award-points` to `npm:` import specifier

### Fixed

- Appointment set detection and idempotency — prevents duplicate point awards from repeated status toggles (PR #32)
- `appointment_set` display name correction in agent points service
- Null guard on string fields in `updateUser`

### Removed

- Firebase and Firebase Admin SDK dependencies
- Morgan logging library
- Firestore database interactions

## [1.1.0] - 2026-02-25

### Added

- Allow agents to update their own name and email
- Allow admin to update `agentCode` via `PUT /users/:userId`

### Fixed

- Guard against null values on string fields in `updateUser`
- Resolve merge conflict with null guards from staging

## [1.0.0] - 2026-02-07

Initial release — Firebase/Firestore backend.

### Added

- **Authentication** — Firebase Authentication with JWT and RBAC
- **User Management** — User CRUD with role-based access control
- **Group Management** — Group creation with multi-trainer support
- **Prospect Management** — Prospect CRUD (originally "Sales API")
- **Event Management** — Event creation with group leader permissions
- **Express API** — TypeScript, Express server with layered architecture
- **Firebase Functions** — Serverless function setup
- **Firestore** — Database integration with indexes
