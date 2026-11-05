# Database

## DynamoDB Client
* All DynamoDB access goes through the `DynamoService` class (`src/services/dynamo.service.ts`). Repositories MUST NOT create AWS SDK clients or send commands directly.
* `DynamoService` wraps the document client and exposes `get`, `put`, `update`, `delete`, `query`, `batchGet` and `transactWrite`. Repositories pass the table, key, index and expressions.
* The wrapper aliases attribute names automatically, because `name` and `status` are DynamoDB reserved words and appear in index keys.
* Table names come from environment variables defined in `serverless.yml` and read through `src/utils/env.ts`.
* Supabase is being removed entirely (see `docs/` notes and the `migrate-to-serverless-lambda` change). Do NOT add Supabase code, `SupabaseService` calls or Supabase types.

## Tables and Indexes
* The design is `docs/dynamodb-access-patterns.html` (gitignored, so only on the owner's machine): one table per aggregate and multi-attribute GSIs on typed fields. Tables and indexes are declared in `serverless.yml`.
* There is no tenant. Never put `tenant_id` in an item, key or index.
* Index key attributes must be absent, never `null` and never an empty string. Repository mappers omit them when empty.
* Every index is eventually consistent. Reads that decide authorization or uniqueness use `ConsistentRead` on the base table.
* Changing a GSI key schema needs the index replaced, so index keys are decided before real data is written.

## Item Types
* There are no generated types. Item interfaces are written by hand in `src/types/` and used only in the Repository layer. Service and Controller layers use derived interfaces (`IUser`, `IGroup`, ...) built with `Pick` or `Omit`.
* Services never return raw items; they map to the derived interface.

## Timestamps
* Every timestamp is stored in UTC as `YYYY-MM-DDTHH:mm:ss.sssZ`, written through one helper. Date-only and time-only fields are stored as given. Month and year boundaries are UTC (`src/utils/period.ts`).

## Relationships
* DynamoDB has no joins. A read that needs related items is a query on an index, a batch get, or a field copied onto the item at write time; the access-pattern document says which.
