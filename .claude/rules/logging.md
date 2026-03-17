# Logging

* The logging library is Pino.
* A middleware is responsible for logging all incoming API requests and outgoing responses.
* Every request lifecycle MUST have a correlation ID generated using Pino's `genReqId` option in the middleware.
* The correlation ID is stored in `AsyncLocalStorage` by the middleware at the start of each request, making it available throughout the entire async call chain — Controller, Service, Repository — without being passed explicitly as a parameter.
* The `LoggingService` reads the correlation ID from `AsyncLocalStorage` whenever it writes a log entry, ensuring every log line is linked to its request.
* All outgoing external API requests and their responses MUST also be logged with the same correlation ID.
* Exception logs at every layer MUST include the correlation ID so errors can be traced back to the originating request.

## Sentry Integration (Dual-Write)

* `LoggingService` dual-writes every log entry to both **Pino** (local console) and **Sentry Logs** (`Sentry.logger.*`). Pino remains the primary local logging output; Sentry Logs are viewable under **Explore > Logs** in the Sentry dashboard.
* Every `LoggingService` call also records a **Sentry breadcrumb**, providing a trail of events leading up to any captured error.
* The **correlation ID** is tagged on every Sentry event via `Sentry.setTag('correlationId')` in the request middleware (`src/app.ts`), linking Sentry issues and logs back to the Pino log trail.
* On authenticated requests, the `authenticate` middleware sets **Sentry user context** (`Sentry.setUser()`) and a **`tenant_id` tag** (`Sentry.setTag('tenant_id')`), so Sentry events are attributable to specific users and tenants.
* **Request body redaction**: Sensitive fields (`password`, `token`, etc.) are redacted before being logged or sent to Sentry. The redaction logic lives in `src/app.ts`.
* Sentry is initialised in `src/instrument.ts` — this file MUST be imported before any other module in the application entry point.