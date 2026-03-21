/******************************************************************************
                            Event Domain Errors
******************************************************************************/

export class EventNotFoundError extends Error {
  public constructor(message = 'Event not found') {
    super(message);
    this.name = 'EventNotFoundError';
  }
}

export class InvalidGroupIdsError extends Error {
  public constructor(message = 'One or more group IDs are invalid or not within your tenant') {
    super(message);
    this.name = 'InvalidGroupIdsError';
  }
}

export class UnauthorizedGroupAccessError extends Error {
  public constructor(message = 'One or more groups are not managed by this trainer') {
    super(message);
    this.name = 'UnauthorizedGroupAccessError';
  }
}

export class InvalidAgentIdsError extends Error {
  public constructor(message = 'One or more agent IDs are invalid, not within your tenant, or do not have the required role') {
    super(message);
    this.name = 'InvalidAgentIdsError';
  }
}
