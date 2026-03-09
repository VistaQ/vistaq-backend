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
