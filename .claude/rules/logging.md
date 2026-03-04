# Logging

* The logging library is Pino.
* A middleware is responsible for logging all incoming API requests and outgoing responses.
* Every request lifecycle MUST have a correlation ID generated using Pino's `genReqId` option in the middleware.
* The correlation ID is stored in `AsyncLocalStorage` by the middleware at the start of each request, making it available throughout the entire async call chain — Controller, Service, Repository — without being passed explicitly as a parameter.
* The `LoggingService` reads the correlation ID from `AsyncLocalStorage` whenever it writes a log entry, ensuring every log line is linked to its request.
* All outgoing external API requests and their responses MUST also be logged with the same correlation ID.
* Exception logs at every layer MUST include the correlation ID so errors can be traced back to the originating request.