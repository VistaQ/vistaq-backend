/******************************************************************************
                            Group Domain Errors
******************************************************************************/

export class InvalidLeaderRoleError extends Error {
  public constructor(message = 'Leader must currently have the agent role') {
    super(message);
    this.name = 'InvalidLeaderRoleError';
  }
}

export class InvalidTrainerRoleError extends Error {
  public constructor(message = 'Trainer must currently have the trainer role') {
    super(message);
    this.name = 'InvalidTrainerRoleError';
  }
}

export class UserNotInTenantError extends Error {
  public constructor(message = 'User not found in tenant') {
    super(message);
    this.name = 'UserNotInTenantError';
  }
}

export class GroupNotFoundError extends Error {
  public constructor(message = 'Group not found') {
    super(message);
    this.name = 'GroupNotFoundError';
  }
}

export class MissingMembersError extends Error {
  public constructor(message = 'Missing members detected') {
    super(message);
    this.name = 'MissingMembersError';
  }
}

export class InvalidLeaderError extends Error {
  public constructor(message = 'leaderId must be an agent') {
    super(message);
    this.name = 'InvalidLeaderError';
  }
}

export class InvalidTrainerError extends Error {
  public constructor(message = 'trainerId must be a trainer') {
    super(message);
    this.name = 'InvalidTrainerError';
  }
}
