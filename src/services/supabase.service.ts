import * as Sentry from '@sentry/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SupabaseServiceError } from '@src/models/errors/supabase.error';
import loggingService from '@src/services/logging.service';
import { Database } from '@src/types/database.types';
import EnvVars from '@src/utils/env';
import { emitDbMetrics } from '@src/utils/sentry.metrics';

/******************************************************************************
                            SupabaseService
******************************************************************************/

/**
 * Centralised service for all Supabase database interactions.
 *
 * Repositories must never instantiate the Supabase client directly — all
 * database calls go through the wrapper methods exposed here.
 */
class SupabaseService {
  private readonly client: SupabaseClient<Database>;
  private readonly adminClient: SupabaseClient<Database>;

  public constructor() {
    this.client = createClient<Database>(
      EnvVars.SupabaseUrl,
      EnvVars.SupabaseAnonKey,
    );

    this.adminClient = createClient<Database>(
      EnvVars.SupabaseUrl,
      EnvVars.SupabaseServiceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  // ---------------------------------------------------------------------------
  // User Client Helper
  // ---------------------------------------------------------------------------

  private getUserClient(userToken: string): SupabaseClient<Database> {
    return createClient<Database>(
      EnvVars.SupabaseUrl,
      EnvVars.SupabaseAnonKey,
      {
        global: { headers: { Authorization: `Bearer ${userToken}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Span Helper
  // ---------------------------------------------------------------------------

  private async withSpan<R>(
    op: string,
    name: string,
    attributes: Record<string, string | number | undefined>,
    fn: () => Promise<R>,
  ): Promise<R> {
    const startTime = Date.now();
    const result = await Sentry.startSpan(
      {
        op,
        name,
        attributes: Object.fromEntries(
          Object.entries(attributes).filter(([, v]) => v !== undefined),
        ),
      },
      fn,
    );
    emitDbMetrics(
      String(attributes.table ?? 'rpc'),
      op,
      Date.now() - startTime,
    );
    return result;
  }

  // ---------------------------------------------------------------------------
  // Select
  // ---------------------------------------------------------------------------

  /**
   * Fetches rows from the given table.
   *
   * @param table   - The table to query.
   * @param columns - Comma-separated column list (defaults to '*').
   * @param filters - Optional key/value pairs applied as `.eq()` filters.
   */
  async select<T extends keyof Database['public']['Tables']>(
    table: T,
    columns = '*',
    filters?: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.query',
      'SupabaseService.select',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'anon',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.select called', {
            table,
            columns,
          });

          let query = this.client.from(table).select(columns);

          if (filters) {
            for (const column of Object.keys(filters) as (string &
              keyof typeof filters)[]) {
              const value = filters[column];
              if (value !== undefined) {
                query = query.eq(column, value as never);
              }
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.select query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.select failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Select operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Insert
  // ---------------------------------------------------------------------------

  /**
   * Inserts one or more rows into the given table.
   *
   * @param table  - The table to insert into.
   * @param values - A single row object or an array of row objects to insert.
   */
  async insert<T extends keyof Database['public']['Tables']>(
    table: T,
    values:
      | Database['public']['Tables'][T]['Insert']
      | Database['public']['Tables'][T]['Insert'][],
  ) {
    return this.withSpan(
      'db.insert',
      'SupabaseService.insert',
      {
        'db.system': 'supabase',
        'db.operation': 'insert',
        'db.collection.name': table as string,
        'db.client_type': 'anon',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.insert called', { table });

          const response = await this.client
            .from(table)
            .insert(values as never)
            .select();

          if (response.error) {
            loggingService.error(
              'SupabaseService.insert query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.insert failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Insert operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  /**
   * Updates rows in the given table that match the provided filters.
   *
   * @param table   - The table to update.
   * @param values  - Column/value pairs to apply as the update.
   * @param filters - Key/value pairs used to identify matching rows.
   */
  async update<T extends keyof Database['public']['Tables']>(
    table: T,
    values: Database['public']['Tables'][T]['Update'],
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.update',
      'SupabaseService.update',
      {
        'db.system': 'supabase',
        'db.operation': 'update',
        'db.collection.name': table as string,
        'db.client_type': 'anon',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.update called', { table });

          if (Object.keys(filters).length === 0) {
            throw new SupabaseServiceError(
              'Update operation rejected: filters must not be empty. Refusing to update all rows.',
            );
          }

          let query = this.client
            .from(table)
            .update(values as never)
            .select();

          for (const column of Object.keys(filters) as (string &
            keyof typeof filters)[]) {
            const value = filters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.update query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.update failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Update operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  /**
   * Deletes rows from the given table that match the provided filters.
   *
   * @param table   - The table to delete from.
   * @param filters - Key/value pairs used to identify rows to delete.
   */
  async delete<T extends keyof Database['public']['Tables']>(
    table: T,
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.delete',
      'SupabaseService.delete',
      {
        'db.system': 'supabase',
        'db.operation': 'delete',
        'db.collection.name': table as string,
        'db.client_type': 'anon',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.delete called', { table });

          if (Object.keys(filters).length === 0) {
            throw new SupabaseServiceError(
              'Delete operation rejected: filters must not be empty. Refusing to delete all rows.',
            );
          }

          let query = this.client.from(table).delete().select();

          for (const column of Object.keys(filters) as (string &
            keyof typeof filters)[]) {
            const value = filters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.delete query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.delete failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Delete operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Select (RLS-bypassing)
  // ---------------------------------------------------------------------------

  /**
   * Fetches rows from the given table using the service role client, bypassing RLS.
   *
   * @param table   - The table to query.
   * @param columns - Comma-separated column list (defaults to '*').
   * @param filters - Optional key/value pairs applied as `.eq()` filters.
   */
  async adminSelect<T extends keyof Database['public']['Tables']>(
    table: T,
    columns = '*',
    filters?: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.query',
      'SupabaseService.adminSelect',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminSelect called', {
            table,
            columns,
          });

          let query = this.adminClient.from(table).select(columns);

          if (filters) {
            for (const column of Object.keys(filters) as (string &
              keyof typeof filters)[]) {
              const value = filters[column];
              if (value !== undefined) {
                query = query.eq(column, value as never);
              }
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminSelect query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminSelect failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Admin select operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Insert (RLS-bypassing)
  // ---------------------------------------------------------------------------

  /**
   * Inserts one or more rows into the given table using the service role client, bypassing RLS.
   *
   * @param table  - The table to insert into.
   * @param values - A single row object or an array of row objects to insert.
   */
  async adminInsert<T extends keyof Database['public']['Tables']>(
    table: T,
    values:
      | Database['public']['Tables'][T]['Insert']
      | Database['public']['Tables'][T]['Insert'][],
  ) {
    return this.withSpan(
      'db.insert',
      'SupabaseService.adminInsert',
      {
        'db.system': 'supabase',
        'db.operation': 'insert',
        'db.collection.name': table as string,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminInsert called', { table });

          const response = await this.adminClient
            .from(table)
            .insert(values as never)
            .select();

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminInsert query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminInsert failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Admin insert operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Upsert (RLS-bypassing)
  // ---------------------------------------------------------------------------

  /**
   * Upserts one or more rows into the given table using the service role client,
   * bypassing RLS. Conflicting rows (per `onConflict`) are updated; new rows are
   * inserted.
   *
   * @param table      - The table to upsert into.
   * @param values     - A single row object or an array of row objects.
   * @param onConflict - Comma-separated unique-constraint columns (e.g. 'tenant_id,user_id,year,month').
   */
  async adminUpsert<T extends keyof Database['public']['Tables']>(
    table: T,
    values:
      | Database['public']['Tables'][T]['Insert']
      | Database['public']['Tables'][T]['Insert'][],
    onConflict: string,
  ) {
    return this.withSpan(
      'db.upsert',
      'SupabaseService.adminUpsert',
      {
        'db.system': 'supabase',
        'db.operation': 'upsert',
        'db.collection.name': table as string,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminUpsert called', { table, onConflict });

          const response = await this.adminClient
            .from(table)
            .upsert(values as never, { onConflict })
            .select();

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminUpsert query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminUpsert failed', error, { table });
          throw new SupabaseServiceError(
            'Admin upsert operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Update (RLS-bypassing)
  // ---------------------------------------------------------------------------

  /**
   * Updates rows in the given table that match the provided filters using the service role
   * client, bypassing RLS.
   *
   * @param table   - The table to update.
   * @param values  - Column/value pairs to apply as the update.
   * @param filters - Key/value pairs used to identify matching rows.
   */
  async adminUpdate<T extends keyof Database['public']['Tables']>(
    table: T,
    values: Database['public']['Tables'][T]['Update'],
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.update',
      'SupabaseService.adminUpdate',
      {
        'db.system': 'supabase',
        'db.operation': 'update',
        'db.collection.name': table as string,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminUpdate called', { table });

          if (Object.keys(filters).length === 0) {
            throw new SupabaseServiceError(
              'Admin update operation rejected: filters must not be empty. Refusing to update all rows.',
            );
          }

          let query = this.adminClient
            .from(table)
            .update(values as never)
            .select();

          for (const column of Object.keys(filters) as (string &
            keyof typeof filters)[]) {
            const value = filters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminUpdate query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminUpdate failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Admin update operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Admin Create Auth User
  // ---------------------------------------------------------------------------

  async adminCreateAuthUser(email: string, password: string) {
    return this.withSpan(
      'auth.create_user',
      'SupabaseService.adminCreateAuthUser',
      {
        'auth.system': 'supabase',
        'auth.operation': 'create_user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminCreateAuthUser called', {
            email,
          });

          const { data, error } = await this.adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
          });

          if (error) {
            loggingService.error(
              'SupabaseService.adminCreateAuthUser error',
              error,
              { email },
            );
            throw new Error(error.message);
          }

          if (!data.user) {
            throw new Error('No auth user returned after creation');
          }

          return data.user;
        } catch (error) {
          loggingService.error(
            'SupabaseService.adminCreateAuthUser failed',
            error,
            { email },
          );
          throw new SupabaseServiceError(
            'Admin create auth user failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Admin Update Auth User Email
  // ---------------------------------------------------------------------------

  async adminUpdateAuthUserEmail(userId: string, email: string): Promise<void> {
    return this.withSpan(
      'auth.update_user',
      'SupabaseService.adminUpdateAuthUserEmail',
      {
        'auth.system': 'supabase',
        'auth.operation': 'update_user_email',
      },
      async () => {
        try {
          loggingService.info(
            'SupabaseService.adminUpdateAuthUserEmail called',
            {
              userId,
            },
          );

          const { error } = await this.adminClient.auth.admin.updateUserById(
            userId,
            { email },
          );

          if (error) {
            loggingService.error(
              'SupabaseService.adminUpdateAuthUserEmail error',
              error,
              { userId },
            );
            throw new Error(error.message);
          }
        } catch (error) {
          loggingService.error(
            'SupabaseService.adminUpdateAuthUserEmail failed',
            error,
            { userId },
          );
          throw new SupabaseServiceError(
            'Admin update auth user email failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Admin Delete Auth User (rollback)
  // ---------------------------------------------------------------------------

  async adminDeleteAuthUser(userId: string) {
    return this.withSpan(
      'auth.delete_user',
      'SupabaseService.adminDeleteAuthUser',
      {
        'auth.system': 'supabase',
        'auth.operation': 'delete_user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminDeleteAuthUser called', {
            userId,
          });

          const { error } =
            await this.adminClient.auth.admin.deleteUser(userId);

          if (error) {
            loggingService.error(
              'SupabaseService.adminDeleteAuthUser error',
              error,
              { userId },
            );
            throw new Error(error.message);
          }
        } catch (error) {
          loggingService.error(
            'SupabaseService.adminDeleteAuthUser failed',
            error,
            { userId },
          );
          throw new SupabaseServiceError(
            'Admin delete auth user failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Sign In With Password
  // ---------------------------------------------------------------------------

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<ReturnType<typeof this.client.auth.signInWithPassword>> {
    return this.withSpan(
      'auth.sign_in',
      'SupabaseService.signInWithPassword',
      {
        'auth.system': 'supabase',
        'auth.operation': 'sign_in',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.signInWithPassword called', {
            email,
          });

          return await this.client.auth.signInWithPassword({ email, password });
        } catch (error) {
          loggingService.error(
            'SupabaseService.signInWithPassword failed',
            error,
            {
              email,
            },
          );
          throw new SupabaseServiceError(
            'Sign in with password failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Sign Out
  // ---------------------------------------------------------------------------

  async signOut(token: string): Promise<void> {
    return this.withSpan(
      'auth.sign_out',
      'SupabaseService.signOut',
      {
        'auth.system': 'supabase',
        'auth.operation': 'sign_out',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.signOut called');

          const { error } = await this.adminClient.auth.admin.signOut(token);

          if (error) {
            loggingService.error('SupabaseService.signOut error', error);
            throw new Error(error.message);
          }
        } catch (error) {
          loggingService.error('SupabaseService.signOut failed', error);
          throw new SupabaseServiceError(
            'Sign out failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Verify Token
  // ---------------------------------------------------------------------------

  /**
   * Verifies a user JWT by passing it to Supabase's auth server.
   * Supabase handles the algorithm (HS256/ES256) automatically.
   * Returns the user if the token is valid, or an error if it is not.
   *
   * @param token - The raw JWT from the Authorization header.
   */
  async verifyToken(token: string) {
    return this.withSpan(
      'auth.get_user',
      'SupabaseService.verifyToken',
      {
        'auth.system': 'supabase',
        'auth.operation': 'verify_token',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.verifyToken called');

          return await this.adminClient.auth.getUser(token);
        } catch (error) {
          loggingService.error('SupabaseService.verifyToken failed', error);
          throw new SupabaseServiceError(
            'Token verification failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Reset Password For Email
  // ---------------------------------------------------------------------------

  async resetPasswordForEmail(
    email: string,
    redirectTo: string,
  ): Promise<void> {
    return this.withSpan(
      'auth.reset_password',
      'SupabaseService.resetPasswordForEmail',
      {
        'auth.system': 'supabase',
        'auth.operation': 'reset_password',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.resetPasswordForEmail called', {
            email,
          });

          const { error } = await this.adminClient.auth.resetPasswordForEmail(
            email,
            { redirectTo },
          );

          if (error) {
            loggingService.error(
              'SupabaseService.resetPasswordForEmail error',
              error,
              { email },
            );
            throw new Error(error.message);
          }
        } catch (error) {
          loggingService.error(
            'SupabaseService.resetPasswordForEmail failed',
            error,
            { email },
          );
          throw new SupabaseServiceError(
            'Reset password for email failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Get User ID From Token
  // ---------------------------------------------------------------------------

  async getUserIdFromToken(token: string): Promise<{ userId: string }> {
    return this.withSpan(
      'auth.get_user',
      'SupabaseService.getUserIdFromToken',
      {
        'auth.system': 'supabase',
        'auth.operation': 'get_user_id',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.getUserIdFromToken called');

          const { data, error } = await this.adminClient.auth.getUser(token);

          if (error) {
            loggingService.error(
              'SupabaseService.getUserIdFromToken error',
              error,
            );
            throw new Error(error.message);
          }

          if (!data.user) {
            throw new Error('No user returned for token');
          }

          return { userId: data.user.id };
        } catch (error) {
          loggingService.error(
            'SupabaseService.getUserIdFromToken failed',
            error,
          );
          throw new SupabaseServiceError(
            'Get user ID from token failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Auth — Admin Update Auth User Password
  // ---------------------------------------------------------------------------

  async adminUpdateAuthUserPassword(
    userId: string,
    password: string,
  ): Promise<void> {
    return this.withSpan(
      'auth.update_user',
      'SupabaseService.adminUpdateAuthUserPassword',
      {
        'auth.system': 'supabase',
        'auth.operation': 'update_user_password',
      },
      async () => {
        try {
          loggingService.info(
            'SupabaseService.adminUpdateAuthUserPassword called',
            {
              userId,
            },
          );

          const { error } = await this.adminClient.auth.admin.updateUserById(
            userId,
            { password },
          );

          if (error) {
            loggingService.error(
              'SupabaseService.adminUpdateAuthUserPassword error',
              error,
              { userId },
            );
            throw new Error(error.message);
          }
        } catch (error) {
          loggingService.error(
            'SupabaseService.adminUpdateAuthUserPassword failed',
            error,
            { userId },
          );
          throw new SupabaseServiceError(
            'Admin update auth user password failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Select (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Fetches rows from the given table using a user-scoped client, enforcing RLS.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to query.
   * @param columns   - Comma-separated column list (defaults to '*').
   * @param filters   - Optional key/value pairs applied as `.eq()` filters.
   */
  async userSelect<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    columns = '*',
    filters?: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.query',
      'SupabaseService.userSelect',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userSelect called', {
            table,
            columns,
          });

          const userClient = this.getUserClient(userToken);
          let query = userClient.from(table).select(columns);

          if (filters) {
            for (const column of Object.keys(filters) as (string &
              keyof typeof filters)[]) {
              const value = filters[column];
              if (value !== undefined) {
                query = query.eq(column, value as never);
              }
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.userSelect query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userSelect failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'User select operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Insert (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Inserts one or more rows into the given table using a user-scoped client, enforcing RLS.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to insert into.
   * @param values    - A single row object or an array of row objects to insert.
   */
  async userInsert<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    values:
      | Database['public']['Tables'][T]['Insert']
      | Database['public']['Tables'][T]['Insert'][],
  ) {
    return this.withSpan(
      'db.insert',
      'SupabaseService.userInsert',
      {
        'db.system': 'supabase',
        'db.operation': 'insert',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userInsert called', { table });

          const userClient = this.getUserClient(userToken);
          const response = await userClient
            .from(table)
            .insert(values as never)
            .select();

          if (response.error) {
            loggingService.error(
              'SupabaseService.userInsert query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userInsert failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'User insert operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Update (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Updates rows in the given table that match the provided filters using a user-scoped
   * client, enforcing RLS.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to update.
   * @param values    - Column/value pairs to apply as the update.
   * @param filters   - Key/value pairs used to identify matching rows.
   */
  async userUpdate<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    values: Database['public']['Tables'][T]['Update'],
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.update',
      'SupabaseService.userUpdate',
      {
        'db.system': 'supabase',
        'db.operation': 'update',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userUpdate called', { table });

          if (Object.keys(filters).length === 0) {
            throw new SupabaseServiceError(
              'User update operation rejected: filters must not be empty. Refusing to update all rows.',
            );
          }

          const userClient = this.getUserClient(userToken);
          let query = userClient
            .from(table)
            .update(values as never)
            .select();

          for (const column of Object.keys(filters) as (string &
            keyof typeof filters)[]) {
            const value = filters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.userUpdate query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userUpdate failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'User update operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Select In (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Fetches rows from the given table where the specified column matches any value
   * in the provided list, using a user-scoped client to enforce RLS.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to query.
   * @param columns   - Comma-separated column list (defaults to '*').
   * @param column    - The column to filter on using `.in()`.
   * @param values    - The list of values to match against.
   */
  async userSelectIn<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    columns = '*',
    column: string & keyof Database['public']['Tables'][T]['Row'],
    values: unknown[],
  ) {
    return this.withSpan(
      'db.query',
      'SupabaseService.userSelectIn',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userSelectIn called', {
            table,
            columns,
            column,
          });

          const userClient = this.getUserClient(userToken);
          const response = await userClient
            .from(table)
            .select(columns)
            .in(column, values as never[]);

          if (response.error) {
            loggingService.error(
              'SupabaseService.userSelectIn query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userSelectIn failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'User select in operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Update In (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Updates rows in the given table where the specified column matches any value
   * in the provided list, using a user-scoped client to enforce RLS.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to update.
   * @param values    - Column/value pairs to apply as the update.
   * @param column    - The column to filter on using `.in()`.
   * @param ids       - The list of values to match against.
   */
  async userUpdateIn<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    values: Database['public']['Tables'][T]['Update'],
    column: string & keyof Database['public']['Tables'][T]['Row'],
    ids: unknown[],
  ) {
    return this.withSpan(
      'db.update',
      'SupabaseService.userUpdateIn',
      {
        'db.system': 'supabase',
        'db.operation': 'update',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userUpdateIn called', {
            table,
            column,
          });

          if (ids.length === 0) {
            throw new SupabaseServiceError(
              'User update-in operation rejected: ids must not be empty. Refusing to update all rows.',
            );
          }

          const userClient = this.getUserClient(userToken);
          const response = await userClient
            .from(table)
            .update(values as never)
            .in(column, ids as never[])
            .select();

          if (response.error) {
            loggingService.error(
              'SupabaseService.userUpdateIn query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userUpdateIn failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'User update in operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Delete (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Deletes rows from the given table that match the provided filters using a user-scoped
   * client, enforcing RLS.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to delete from.
   * @param filters   - Key/value pairs used to identify rows to delete.
   */
  async userDelete<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.delete',
      'SupabaseService.userDelete',
      {
        'db.system': 'supabase',
        'db.operation': 'delete',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userDelete called', { table });

          if (Object.keys(filters).length === 0) {
            throw new SupabaseServiceError(
              'User delete operation rejected: filters must not be empty. Refusing to delete all rows.',
            );
          }

          const userClient = this.getUserClient(userToken);
          let query = userClient.from(table).delete().select();

          for (const column of Object.keys(filters) as (string &
            keyof typeof filters)[]) {
            const value = filters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.userDelete query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userDelete failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'User delete operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User RPC (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Invokes a Postgres function via RPC using a user-scoped client, enforcing RLS.
   *
   * @param userToken    - The user's JWT, used to build the user-scoped client.
   * @param functionName - The name of the Postgres function to call.
   * @param params       - Optional parameters to pass to the function.
   */
  async userRpc(
    userToken: string,
    functionName: string,
    params?: Record<string, unknown>,
  ) {
    return this.withSpan(
      'db.rpc',
      'SupabaseService.userRpc',
      {
        'db.system': 'supabase',
        'db.operation': 'rpc',
        'db.collection.name': functionName,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userRpc called', {
            functionName,
          });

          const userClient = this.getUserClient(userToken);
          const response = await userClient.rpc(
            functionName as never,
            params as never,
          );

          if (response.error) {
            loggingService.error(
              'SupabaseService.userRpc query error',
              response.error,
              { functionName },
            );
            throw new SupabaseServiceError(
              'RPC query returned an error',
              response.error,
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.userRpc failed', error, {
            functionName,
          });
          throw new SupabaseServiceError(
            'RPC operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin RPC (RLS-bypassing)
  // ---------------------------------------------------------------------------

  /**
   * Invokes a Postgres function via RPC using the service role client, bypassing RLS.
   *
   * @param functionName - The name of the Postgres function to call.
   * @param params       - Optional parameters to pass to the function.
   */
  async adminRpc(functionName: string, params?: Record<string, unknown>) {
    return this.withSpan(
      'db.rpc',
      'SupabaseService.adminRpc',
      {
        'db.system': 'supabase',
        'db.operation': 'rpc',
        'db.collection.name': functionName,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminRpc called', {
            functionName,
          });

          const response = await this.adminClient.rpc(
            functionName as never,
            params as never,
          );

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminRpc query error',
              response.error,
              { functionName },
            );
            throw new SupabaseServiceError(
              'RPC query returned an error',
              response.error,
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminRpc failed', error, {
            functionName,
          });
          throw new SupabaseServiceError(
            'Admin RPC operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Count (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Returns the count of rows matching an .in() filter, using a user-scoped
   * client to enforce RLS. No rows are fetched — only the count is returned.
   *
   * @param userToken - The user's JWT, used to build the user-scoped client.
   * @param table     - The table to query.
   * @param column    - The column to filter on using `.in()`.
   * @param values    - The list of values to match against.
   */
  async userCount<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    column: string & keyof Database['public']['Tables'][T]['Row'],
    values: unknown[],
  ): Promise<number> {
    return this.withSpan(
      'db.query',
      'SupabaseService.userCount',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userCount called', {
            table,
            column,
          });

          const userClient = this.getUserClient(userToken);
          const { count, error } = await userClient
            .from(table)
            .select('*', { count: 'exact', head: true })
            .in(column, values as never[]);

          if (error) {
            loggingService.error(
              'SupabaseService.userCount query error',
              error,
              { table },
            );
            throw new SupabaseServiceError(
              'Count query returned an error',
              error,
            );
          }

          return count ?? 0;
        } catch (error) {
          loggingService.error('SupabaseService.userCount failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Count operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // User Count With Eq (RLS-enforced)
  // ---------------------------------------------------------------------------

  /**
   * Returns the count of rows matching both eq filters and an .in() filter,
   * using a user-scoped client to enforce RLS. No rows are fetched — only the count.
   *
   * @param userToken  - The user's JWT, used to build the user-scoped client.
   * @param table      - The table to query.
   * @param eqFilters  - Key/value pairs applied as .eq() filters.
   * @param inColumn   - The column to filter on using .in().
   * @param inValues   - The list of values to match against.
   */
  async userCountWithEq<T extends keyof Database['public']['Tables']>(
    userToken: string,
    table: T,
    eqFilters: Partial<Database['public']['Tables'][T]['Row']>,
    inColumn: string & keyof Database['public']['Tables'][T]['Row'],
    inValues: unknown[],
  ): Promise<number> {
    return this.withSpan(
      'db.query',
      'SupabaseService.userCountWithEq',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'user',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.userCountWithEq called', {
            table,
            inColumn,
          });

          const userClient = this.getUserClient(userToken);
          let query = userClient
            .from(table)
            .select('*', { count: 'exact', head: true });

          for (const column of Object.keys(eqFilters) as (string &
            keyof typeof eqFilters)[]) {
            const value = eqFilters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          query = query.in(inColumn, inValues as never[]);

          const { count, error } = await query;

          if (error) {
            loggingService.error(
              'SupabaseService.userCountWithEq query error',
              error,
              { table },
            );
            throw new SupabaseServiceError(
              'Count with eq query returned an error',
              error,
            );
          }

          return count ?? 0;
        } catch (error) {
          loggingService.error(
            'SupabaseService.userCountWithEq failed',
            error,
            { table },
          );
          throw new SupabaseServiceError(
            'Count with eq operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Delete (RLS-bypassing)
  // ---------------------------------------------------------------------------

  /**
   * Deletes rows from the given table that match the provided filters using the service role
   * client, bypassing RLS.
   *
   * @param table   - The table to delete from.
   * @param filters - Key/value pairs used to identify rows to delete.
   */
  async adminSelectIn<T extends keyof Database['public']['Tables']>(
    table: T,
    columns = '*',
    column: string & keyof Database['public']['Tables'][T]['Row'],
    values: unknown[],
    filters?: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.query',
      'SupabaseService.adminSelectIn',
      {
        'db.system': 'supabase',
        'db.operation': 'select',
        'db.collection.name': table as string,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminSelectIn called', {
            table,
            columns,
            column,
          });

          let query = this.adminClient
            .from(table)
            .select(columns)
            .in(column, values as never[]);

          if (filters) {
            for (const filterColumn of Object.keys(filters) as (string &
              keyof typeof filters)[]) {
              const value = filters[filterColumn];
              if (value !== undefined) {
                query = query.eq(filterColumn, value as never);
              }
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminSelectIn query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminSelectIn failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Admin select in operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Admin Delete (RLS-bypassing)
  // ---------------------------------------------------------------------------

  async adminDelete<T extends keyof Database['public']['Tables']>(
    table: T,
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
    return this.withSpan(
      'db.delete',
      'SupabaseService.adminDelete',
      {
        'db.system': 'supabase',
        'db.operation': 'delete',
        'db.collection.name': table as string,
        'db.client_type': 'admin',
      },
      async () => {
        try {
          loggingService.info('SupabaseService.adminDelete called', { table });

          if (Object.keys(filters).length === 0) {
            throw new SupabaseServiceError(
              'Admin delete operation rejected: filters must not be empty. Refusing to delete all rows.',
            );
          }

          let query = this.adminClient.from(table).delete().select();

          for (const column of Object.keys(filters) as (string &
            keyof typeof filters)[]) {
            const value = filters[column];
            if (value !== undefined) {
              query = query.eq(column, value as never);
            }
          }

          const response = await query;

          if (response.error) {
            loggingService.error(
              'SupabaseService.adminDelete query error',
              response.error,
              { table },
            );
          }

          return response;
        } catch (error) {
          loggingService.error('SupabaseService.adminDelete failed', error, {
            table,
          });
          throw new SupabaseServiceError(
            'Admin delete operation failed in SupabaseService',
            error,
          );
        }
      },
    );
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const supabaseService = new SupabaseService();
export default supabaseService;
