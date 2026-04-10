# Validation

* Request validation is done using the **Zod** library.
* Each route defines its own Zod schema that describes the expected request body shape and validation rules. The schema is exported and passed into the `validate` middleware factory.
* The `validate` middleware factory accepts a Zod schema as a parameter and returns an Express middleware function that validates `req.body` against it.
* On successful validation, the parsed and validated result is assigned back to `req.body` before calling `next()`.
* If validation fails with a Zod error, the middleware returns HTTP **400** with `{ message: "Validation failed", errors: error.errors }` directly — this bypasses the centralised error middleware intentionally, as validation errors are client errors, not server errors.
* Any non-Zod errors caught in the validation middleware MUST be passed to `next(error)` so they flow through the centralised error handling middleware and return HTTP **500**.