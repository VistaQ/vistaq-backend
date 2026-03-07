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

export class InvalidCredentialsError extends Error {
  public constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}
