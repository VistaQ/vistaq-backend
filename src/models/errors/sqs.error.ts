export class SqsServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SqsServiceError';
    this.cause = cause;
  }
}
