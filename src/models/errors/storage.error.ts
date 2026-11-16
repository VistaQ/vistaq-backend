export class StorageServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'StorageServiceError';
    this.cause = cause;
  }
}
