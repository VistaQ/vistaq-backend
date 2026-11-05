// The schema is single-tenant. Services that still read a tenant id get this
// constant until the last tenant-aware repository is rewritten and removed.
export const TRANSITIONAL_TENANT_ID = 'single-tenant';
