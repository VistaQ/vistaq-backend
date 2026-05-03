// Set env vars BEFORE importing — EnvVars captures them at module load time
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test-anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-srk';
process.env.FRONTEND_RESET_PASSWORD_URL = process.env.FRONTEND_RESET_PASSWORD_URL || 'http://test/reset';
process.env.ETL_SERVICE_URL = process.env.ETL_SERVICE_URL || 'http://etl';
process.env.ETL_API_KEY = 'expected-key';
process.env.BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || 'http://api';

import { internalKey } from '@src/middleware/internalKey';

const mkRes = () => {
  const res: { status?: jest.Mock; json?: jest.Mock } = {};
  res.status = jest.fn().mockReturnValue(res as never);
  res.json = jest.fn().mockReturnValue(res as never);
  return res as { status: jest.Mock; json: jest.Mock };
};

describe('internalKey middleware', () => {
  it('calls next when the header matches', () => {
    const req = { headers: { authorization: 'Bearer expected-key' } } as never;
    const res = mkRes();
    const next = jest.fn();

    internalKey(req, res as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when header is missing', () => {
    const req = { headers: {} } as never;
    const res = mkRes();
    const next = jest.fn();

    internalKey(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when key is wrong', () => {
    const req = { headers: { authorization: 'Bearer wrong' } } as never;
    const res = mkRes();
    const next = jest.fn();

    internalKey(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
