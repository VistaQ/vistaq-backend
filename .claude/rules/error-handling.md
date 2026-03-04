# Error Handling

* Every function in each layer MUST have a try...catch block and all logic MUST be inside the try block.
* Each layer (Repository, Service, Controller) has its own error handler function that logs the error message, wraps it in a custom error class, and rethrows it so the upper layer catches it and repeats the same process.
* The Controller is the final layer — it catches, logs, wraps and rethrows like other layers. It does NOT return the error response directly.
* A centralised Express error-handling middleware sits at the end of the middleware chain. It catches any error that bubbles up through all layers and returns the final error response: HTTP 500 with `{ message: 'Server Error' }`.
* The error-handling middleware MUST be registered last in the Express app, after all routes.
* The error-handling middleware signature must follow Express convention: `(err, req, res, next)`