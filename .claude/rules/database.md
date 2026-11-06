# Database

## DynamoDB Client
* All DynamoDB access goes through the `DynamoService` class (`src/services/dynamo.service.ts`). Repositories MUST NOT create AWS SDK clients or send commands directly.
* Each repository binds its tables once at module level by base name: `const users = new DynamoTable<IUserItem>('Users');`. Base names are the typed list in `src/constants/tables.ts`. Methods call `users.get`, `users.put`, `users.update`, `users.updateFields`, `users.delete`, `users.query`, `users.queryAll` and `users.batchGet`, passing only the key, index and expressions. Never pass a table name per call.
* `updateFields(key, fields, options)` is the partial update: it sets each defined field, removes each `null` one and stamps `updated_at`. Use it instead of building SET/REMOVE expressions by hand.
* Writes that span items or tables go through `dynamoService.transactWrite([...])` with items built by the tables (`users.putItem`, `users.updateItem`, `users.deleteItem`).
* `DynamoService` underneath wraps the document client, maps condition failures to `DynamoConditionFailedError`, and aliases attribute names automatically, because `name` and `status` are DynamoDB reserved words and appear in index keys.
* Deployed table names are `<prefix><BaseName>`, for example `stg_vistaq_Users`. The prefix is the `tablePrefix` param in `serverless.yml` (`dev_vistaq_`, `stg_vistaq_`, `prod_vistaq_`) and reaches the function as the one `TABLE_PREFIX` variable, read through `src/utils/env.ts`. A new table is added to `TABLE_NAMES` and to `serverless.yml` with `TableName: ${param:tablePrefix}<BaseName>`.
* Supabase has been removed. Do NOT add Supabase code, clients or types back.

## Tables and Indexes
* The design is `docs/dynamodb-access-patterns.html` (gitignored, so only on the owner's machine): one table per aggregate and multi-attribute GSIs on typed fields. Tables and indexes are declared in `serverless.yml`.
* There is no tenant. Never put `tenant_id` in an item, key or index.
* Index key attributes must be absent, never `null` and never an empty string. Repository mappers omit them when empty.
* Every index is eventually consistent. Reads that decide authorization or uniqueness use `ConsistentRead` on the base table.
* Changing a GSI key schema needs the index replaced, so index keys are decided before real data is written.

## Item Types
* There are no generated types. Item interfaces (`IUserItem`) are written by hand in their repository file and used only in the Repository layer (the seeder imports them as types). Service and Controller layers use the domain interfaces in `src/types/` (`IUser`, `IGroup`, ...).
* Services never return raw items; they map to the derived interface.

## Timestamps
* Every timestamp is stored in UTC as `YYYY-MM-DDTHH:mm:ss.sssZ`, written through one helper. Date-only and time-only fields are stored as given. Month and year boundaries are UTC (`src/utils/period.ts`).

## Relationships
* DynamoDB has no joins. A read that needs related items is a query on an index, a batch get, or a field copied onto the item at write time; the access-pattern document says which.
