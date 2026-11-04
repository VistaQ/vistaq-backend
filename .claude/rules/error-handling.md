# Error Handling

* Every function in each layer MUST have a try...catch block and all logic MUST be inside the try block.
* Each layer (Repository, Service, Controller) has its own error handler function that wraps the error in a custom error class and rethrows it so the upper layer catches it and repeats the same process. No layer logs: logging is intentionally absent until a replacement is chosen (see `logging.md`).
* The Controller is the final layer — it catches, wraps and rethrows like other layers. It does NOT return the error response directly.
* A centralised Express error-handling middleware sits at the end of the middleware chain. It catches any error that bubbles up through all layers and returns the final error response: HTTP 500 with `{ message: 'Server Error' }`.
* The error-handling middleware MUST be registered last in the Express app, after all routes.
* The error-handling middleware signature must follow Express convention: `(err, req, res, next)`

## Observability

* There is no error reporting service. The centralised middleware returns the response and nothing is logged or reported until a replacement is chosen (see `logging.md`).
* `getRootCause()` in `src/utils/errors.ts` walks the `.cause` chain. Services use it to recognise a domain error that a lower layer wrapped.
