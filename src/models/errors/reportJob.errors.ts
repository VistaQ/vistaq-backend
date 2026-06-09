/******************************************************************************
                            Report Job Domain Errors
******************************************************************************/

export class ReportJobNotFoundError extends Error {
  public constructor(message = 'Report job not found') {
    super(message);
    this.name = 'ReportJobNotFoundError';
  }
}

export class JobNotRetryableError extends Error {
  public constructor(message = 'Only failed jobs can be retried') {
    super(message);
    this.name = 'JobNotRetryableError';
  }
}

export class EtlServiceError extends Error {
  public constructor(message = 'ETL service request failed') {
    super(message);
    this.name = 'EtlServiceError';
  }
}
