/******************************************************************************
                            Supabase Error Classes
******************************************************************************/

/**
 * Error thrown by SupabaseService when an unhandled exception occurs
 * in the service layer.
 */
export class SupabaseServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SupabaseServiceError';
    this.cause = cause;
  }
}
