/******************************************************************************
                            Sales Report Domain Errors
******************************************************************************/

export class InvalidEtlResultError extends Error {
  public constructor(message = 'ETL result is missing required data') {
    super(message);
    this.name = 'InvalidEtlResultError';
  }
}

export class NonConsecutiveUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonConsecutiveUploadError';
  }
}
