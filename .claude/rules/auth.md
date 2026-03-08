# Authentication

## Middleware

* The `authenticate` middleware lives at `src/middleware/auth.ts` and is exported as a named export.
* It verifies the Bearer JWT via `supabaseService.verifyToken()` (which calls `adminClient.auth.getUser(token)`). This handles both HS256 and ES256 token algorithms automatically — do NOT use `jwt.verify()` with `SUPABASE_JWT_SECRET` for token verification.
* After verification it decodes the token with `jwt.decode()` to extract custom claims.

## Custom JWT Claims

Supabase's custom access token hook embeds the following claims in the JWT payload:

| Claim | Maps to | Description |
|---|---|---|
| `user_id` | `req.user.id` | The user's UUID |
| `tenant_id` | `req.user.tenant_id` | The tenant UUID |
| `app_role` | `req.user.role` | The user's application role (e.g. `"agent"`) |

> **Important**: The JWT also contains a `role` field set to `"authenticated"` — this is Supabase's system role, NOT the application role. Always read `app_role` for the user's role.

## Protecting Routes

Apply `authenticate` as middleware before the controller handler:

```typescript
import { authenticate } from '@src/middleware/auth';

router.get(
  '/protected',
  authenticate,
  (req, res, next) => controller.method(req as unknown as IReq, res, next),
);
```

## Accessing the Authenticated User

`req.user` is typed as `{ id: string; tenant_id: string; role: string } | undefined` via declaration merging in `src/types/express.d.ts`.

On routes protected by `authenticate`, use the non-null assertion since the middleware guarantees the property is set:

```typescript
const userId: string = req.user!.id;
const tenantId: string = req.user!.tenant_id;
const role: string = req.user!.role;
```
