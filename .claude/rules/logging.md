# Logging and Observability

* All application logging and third-party observability is intentionally removed. Pino, `LoggingService`, the request-logging middleware, the correlation ID and Sentry (errors, metrics, tags, user context) are gone, and no layer logs or reports.
* The stack is AWS-only until the user says otherwise. Do NOT add `console.*` calls, a logging shim, Sentry, or bring back Pino. A replacement (an AWS-native option or another package) will be chosen and added as one change.
* Until then handled errors leave no trace: Express catches them and returns the JSON error response. Only Lambda startup crashes and platform errors reach CloudWatch, written by the runtime.

## When logging comes back

* Every request lifecycle needs a correlation ID. On Lambda the platform request id is already available, so prefer it over generating one.
* Sensitive fields (`password`, `token`, `refreshToken`, `accessToken`) must be redacted before anything is logged.
* Error handling at each layer wraps and rethrows (see `error-handling.md`); the new logger should attach at the same points.
* The award-points spec (`openspec/changes/migrate-to-serverless-lambda/specs/award-points-stream`) requires errors to be logged for unconfigured activities, an unknown coaching type and an invalid duration; those requirements depend on the new logger.
