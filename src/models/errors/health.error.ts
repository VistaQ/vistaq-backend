/******************************************************************************
                            Health Error Classes
******************************************************************************/

/**
 * Error thrown by HealthService when an unhandled exception occurs
 * in the service layer.
 */
export class HealthServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'HealthServiceError';
    this.cause = cause;
  }
}

/**
 * Error thrown by HealthController when an unhandled exception occurs
 * in the controller layer.
 */
export class HealthControllerError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'HealthControllerError';
    this.cause = cause;
  }
}
