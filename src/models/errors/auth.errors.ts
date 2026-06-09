/******************************************************************************
                            Auth Domain Errors
******************************************************************************/

export class TenantNotFoundError extends Error {
  public constructor(message = 'Tenant not found') {
    super(message);
    this.name = 'TenantNotFoundError';
  }
}

export class AgentCodeInvalidError extends Error {
  public constructor(message = 'Invalid or already used agent code') {
    super(message);
    this.name = 'AgentCodeInvalidError';
  }
}

export class UserNotFoundError extends Error {
  public constructor(message = 'User not found') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}

export class InvalidCredentialsError extends Error {
  public constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class UserInactiveError extends Error {
  public constructor(message = 'Account is inactive') {
    super(message);
    this.name = 'UserInactiveError';
  }
}

