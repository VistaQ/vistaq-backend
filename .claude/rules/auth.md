# Authentication

## Middleware

* The `authenticate` middleware lives at `src/middleware/auth.ts` and is exported as a named export.
* It identifies the caller from a Cognito access token. Behind API Gateway the JWT authorizer has already verified the token, so the middleware reads `sub` and `iat` from the authorizer claims; anywhere else (local development) it verifies the bearer token with `aws-jwt-verify` against the same user pool and client.
* It then loads the user from the Users table with a consistent read. Role, group and status come from that item, never from token claims.
* It responds 401 when the token is missing or invalid, the user does not exist or has no role, or the token was issued at or before the user's `signed_out_at` (logout revokes tokens this way, because the gateway authorizer cannot see revocation). It responds 403 `Account is inactive` when the user's status is not `active`.

## Protecting Routes

The gateway authorizer guards the catch-all route; the public routes listed in `serverless.yml` skip it. Apply `authenticate` before the controller handler on every protected route:

```typescript
import { authenticate } from '@src/middleware/auth';

router.get(
  '/protected',
  authenticate,
  (req, res, next) => controller.method(req as unknown as IReq, res, next),
);
```

## Accessing the Authenticated User

`req.user` is `{ id, tenant_id, role, group_id }` via declaration merging in `src/types/express.d.ts`; `tenant_id` is the transitional constant until task 4.8 removes it. On protected routes pass the caller to services with `callerOf(req)` from `src/utils/caller.ts`; services decide visibility through `scopeService` (`resolveGroupScope`, `resolveAgentScope`, `canReadAgent`).
