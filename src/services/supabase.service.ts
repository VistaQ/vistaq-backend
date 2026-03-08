import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SupabaseServiceError } from '@src/models/errors/supabase.error';
import loggingService from '@src/services/logging.service';
import { Database } from '@src/types/database.types';
import EnvVars from '@src/utils/env';

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
    return createClient<Database>(EnvVars.SupabaseUrl, EnvVars.SupabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
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
    try {
      loggingService.info('SupabaseService.select called', { table, columns });

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
      loggingService.error('SupabaseService.select failed', error, { table });
      throw new SupabaseServiceError(
        'Select operation failed in SupabaseService',
        error,
      );
    }
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
      loggingService.error('SupabaseService.insert failed', error, { table });
      throw new SupabaseServiceError(
        'Insert operation failed in SupabaseService',
        error,
      );
    }
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
      loggingService.error('SupabaseService.update failed', error, { table });
      throw new SupabaseServiceError(
        'Update operation failed in SupabaseService',
        error,
      );
    }
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
      loggingService.error('SupabaseService.delete failed', error, { table });
      throw new SupabaseServiceError(
        'Delete operation failed in SupabaseService',
        error,
      );
    }
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
  }

  // ---------------------------------------------------------------------------
  // Auth — Admin Create Auth User
  // ---------------------------------------------------------------------------

  async adminCreateAuthUser(email: string, password: string) {
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
  }

  // ---------------------------------------------------------------------------
  // Auth — Admin Delete Auth User (rollback)
  // ---------------------------------------------------------------------------

  async adminDeleteAuthUser(userId: string) {
    try {
      loggingService.info('SupabaseService.adminDeleteAuthUser called', {
        userId,
      });

      const { error } = await this.adminClient.auth.admin.deleteUser(userId);

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
  }

  // ---------------------------------------------------------------------------
  // Auth — Sign In With Password
  // ---------------------------------------------------------------------------

  async signInWithPassword(
    email: string,
    password: string,
  ): Promise<ReturnType<typeof this.client.auth.signInWithPassword>> {
    try {
      loggingService.info('SupabaseService.signInWithPassword called', {
        email,
      });

      return await this.client.auth.signInWithPassword({ email, password });
    } catch (error) {
      loggingService.error('SupabaseService.signInWithPassword failed', error, {
        email,
      });
      throw new SupabaseServiceError(
        'Sign in with password failed in SupabaseService',
        error,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Auth — Sign Out
  // ---------------------------------------------------------------------------

  async signOut(token: string): Promise<void> {
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
    try {
      loggingService.info('SupabaseService.userUpdate called', { table });

      if (Object.keys(filters).length === 0) {
        throw new SupabaseServiceError(
          'User update operation rejected: filters must not be empty. Refusing to update all rows.',
        );
      }

      const userClient = this.getUserClient(userToken);
      let query = userClient.from(table).update(values as never).select();

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
  async adminDelete<T extends keyof Database['public']['Tables']>(
    table: T,
    filters: Partial<Database['public']['Tables'][T]['Row']>,
  ) {
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
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const supabaseService = new SupabaseService();
export default supabaseService;
