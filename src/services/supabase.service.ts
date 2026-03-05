import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SupabaseServiceError } from '@src/models/errors/supabase.error';
import { Database } from '@src/types/database.types';
import EnvVars from '@src/utils/env';

import loggingService from '@src/services/logging.service';

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

  public constructor() {
    this.client = createClient<Database>(
      EnvVars.SupabaseUrl,
      EnvVars.SupabaseAnonKey,
    );
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
        for (const [column, value] of Object.entries(filters)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query = query.eq(column as any, value as any);
        }
      }

      const response = await query;

      if (response.error) {
        loggingService.error('SupabaseService.select query error', response.error, { table });
      }

      return response;
    } catch (error) {
      loggingService.error('SupabaseService.select failed', error, { table });
      throw new SupabaseServiceError('Select operation failed in SupabaseService', error);
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

      const response = await this.client.from(table).insert(values as never).select();

      if (response.error) {
        loggingService.error('SupabaseService.insert query error', response.error, { table });
      }

      return response;
    } catch (error) {
      loggingService.error('SupabaseService.insert failed', error, { table });
      throw new SupabaseServiceError('Insert operation failed in SupabaseService', error);
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

      let query = this.client.from(table).update(values as never).select();

      for (const [column, value] of Object.entries(filters)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.eq(column as any, value as any);
      }

      const response = await query;

      if (response.error) {
        loggingService.error('SupabaseService.update query error', response.error, { table });
      }

      return response;
    } catch (error) {
      loggingService.error('SupabaseService.update failed', error, { table });
      throw new SupabaseServiceError('Update operation failed in SupabaseService', error);
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

      for (const [column, value] of Object.entries(filters)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = query.eq(column as any, value as any);
      }

      const response = await query;

      if (response.error) {
        loggingService.error('SupabaseService.delete query error', response.error, { table });
      }

      return response;
    } catch (error) {
      loggingService.error('SupabaseService.delete failed', error, { table });
      throw new SupabaseServiceError('Delete operation failed in SupabaseService', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const supabaseService = new SupabaseService();
export default supabaseService;
