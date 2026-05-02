/******************************************************************************
                            Sales Report Domain Errors
******************************************************************************/

export class InvalidEtlResultError extends Error {
  public constructor(message = 'ETL result is missing required data') {
    super(message);
    this.name = 'InvalidEtlResultError';
  }
}

export class UnknownReportMonthError extends Error {
  public constructor(message = 'Report month name in months_detected is not a recognised month') {
    super(message);
    this.name = 'UnknownReportMonthError';
  }
}
