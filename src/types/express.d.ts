declare namespace Express {
  interface Request {
    user?: {
      id: string;
      tenant_id: string;
      role: string;
      group_id: string | null;
    };
  }
}
