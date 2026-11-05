export class CognitoServiceError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CognitoServiceError';
    this.cause = cause;
  }
}

export class CognitoRateLimitedError extends Error {
  public constructor(message = 'Too many attempts, try again later') {
    super(message);
    this.name = 'CognitoRateLimitedError';
  }
}
