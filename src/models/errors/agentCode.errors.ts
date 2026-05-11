export class AgentCodeNotFoundError extends Error {
  constructor(message = 'Agent code not found') {
    super(message);
    this.name = 'AgentCodeNotFoundError';
  }
}

export class AgentCodeConflictError extends Error {
  constructor(message = 'Agent code already exists') {
    super(message);
    this.name = 'AgentCodeConflictError';
  }
}
