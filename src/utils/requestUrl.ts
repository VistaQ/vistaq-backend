import type { Request } from 'express';

/** The address this request reached the API on; used as the ETL callback base. */
export function baseUrlOf(req: Request): string {
  const domain = req.apiGateway?.event.requestContext.domainName;
  return domain ? `https://${domain}` : `${req.protocol}://${req.get('host')}`;
}
