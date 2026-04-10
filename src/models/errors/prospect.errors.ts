/******************************************************************************
                            Prospect Domain Errors
******************************************************************************/

export class ProspectNotFoundError extends Error {
  public constructor(message = 'Prospect not found') {
    super(message);
    this.name = 'ProspectNotFoundError';
  }
}
