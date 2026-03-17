# Error Handling

* Every function in each layer MUST have a try...catch block and all logic MUST be inside the try block.
* Each layer (Repository, Service, Controller) has its own error handler function that logs the error message, wraps it in a custom error class, and rethrows it so the upper layer catches it and repeats the same process.
* The Controller is the final layer — it catches, logs, wraps and rethrows like other layers. It does NOT return the error response directly.
* A centralised Express error-handling middleware sits at the end of the middleware chain. It catches any error that bubbles up through all layers and returns the final error response: HTTP 500 with `{ message: 'Server Error' }`.
* The error-handling middleware MUST be registered last in the Express app, after all routes.
* The error-handling middleware signature must follow Express convention: `(err, req, res, next)`

## Sentry Error Capture

* Sentry automatically captures unhandled errors via its Express integration. The `beforeSend` hook in `src/instrument.ts` classifies errors by HTTP status: 4xx errors are reported at **warning** level, 5xx errors at **error** level.
* `handleControllerError` in `src/utils/errorHandlers.ts` uses `Sentry.withScope()` to attach **error fingerprinting** based on the root cause. The `getRootCause()` utility (`src/utils/sentry.utils.ts`) walks the error `.cause` chain to extract the deepest originating error, which Sentry uses for issue grouping.
* This ensures that errors with the same root cause are grouped into a single Sentry issue, regardless of which Controller or endpoint surfaced them.