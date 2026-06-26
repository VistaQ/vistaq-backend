export class TaxonomyNotFoundError extends Error {
  constructor(message = 'Taxonomy not found') {
    super(message);
    this.name = 'TaxonomyNotFoundError';
  }
}

export class TaxonomyConflictError extends Error {
  constructor(message = 'A taxonomy value with this type already exists') {
    super(message);
    this.name = 'TaxonomyConflictError';
  }
}
