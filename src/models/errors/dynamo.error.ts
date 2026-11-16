export class DynamoServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DynamoServiceError';
    this.cause = cause;
  }
}

export class DynamoConditionFailedError extends Error {
  public constructor(message = 'Condition check failed') {
    super(message);
    this.name = 'DynamoConditionFailedError';
  }
}
