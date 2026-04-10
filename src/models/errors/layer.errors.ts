/******************************************************************************
                        Layer Error Classes
******************************************************************************/

/**
 * Error thrown by the Repository layer. Wraps the original cause and
 * bubbles up to the Service layer.
 */
export class RepositoryError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
    this.cause = cause;
  }
}

/**
 * Error thrown by the Service layer. Wraps the original cause and
 * bubbles up to the Controller layer.
 */
export class ServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ServiceError';
    this.cause = cause;
  }
}

/**
 * Error thrown by the Controller layer. Wraps the original cause and
 * is passed to the centralised Express error-handling middleware via next().
 */
export class ControllerError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'ControllerError';
    this.cause = cause;
  }
}
