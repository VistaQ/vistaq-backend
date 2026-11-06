/******************************************************************************
                            Prospect Domain Errors
******************************************************************************/

export class ProspectNotFoundError extends Error {
  public constructor(message = 'Prospect not found') {
    super(message);
    this.name = 'ProspectNotFoundError';
  }
}

export class InvalidPageTokenError extends Error {
  public constructor(message = 'Invalid nextToken') {
    super(message);
    this.name = 'InvalidPageTokenError';
  }
}
