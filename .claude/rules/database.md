# Database

## Supabase Client
* All database interactions go through the `SupabaseService` class. Repositories MUST NOT instantiate the Supabase client directly.
* `SupabaseService` exposes wrapper methods for standard CRUD operations. Repositories call these methods by specifying the table, columns, filters, and any other parameters needed.

## Relationships
* The base Repository class exposes a `findWithRelations` method that accepts a table name, record ID, and an array of related table names.
* The method dynamically builds the Supabase select string and leverages Supabase's native relationship querying — a single network call handles the join.
* Concrete Repository classes (e.g. `UserRepository`) call `findWithRelations` and specify only which relations to include. They never write raw Supabase select strings directly.
* Supabase's native relationship querying requires that foreign key constraints are properly defined in the Postgres schema. Ensure relationships are defined at the database level before using this pattern.

## Edge Functions
* Edge Functions are invoked from the **Service layer**, not the Repository layer.

## Type Generation
* The Supabase CLI is used to generate TypeScript types directly from the database schema.
* Run the following command to generate types: `supabase gen types typescript --project-id your-project-id > src/types/database.types.ts`
* Database model interfaces MUST be derived from these generated types. Do NOT manually define database model interfaces — the database schema is the single source of truth.
* Anytime a schema change is made, the types MUST be regenerated immediately before continuing with implementation.
* `IModel` as a manually defined parent interface is obsolete. Shared metadata fields like `created_at` and `updated_at` are already present in every Supabase-generated `Row` type.
* Do NOT manually define model interfaces. Instead, derive domain model interfaces from the generated types using TypeScript utility types:
```typescript
import { Database } from '../types/database.types'

// Raw generated type — use only in Repository layer
type UserRow = Database['public']['Tables']['users']['Row']

// Derived interface — use across Service and Controller layers
type IUser = Pick<UserRow, 'id' | 'email' | 'created_at' | 'updated_at'>
```
* Derived interfaces live in `src/types/` alongside the generated types file.