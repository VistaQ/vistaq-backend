import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

// Set env vars BEFORE importing — EnvVars captures them at module load time
vi.hoisted(() => {
  process.env.ETL_SERVICE_URL = process.env.ETL_SERVICE_URL || 'http://etl';
  process.env.ETL_API_KEY = 'expected-key';
});

import { internalKey } from '@src/middleware/internalKey';

const mkRes = () => {
  const res: { status?: Mock; json?: Mock } = {};
  res.status = vi.fn().mockReturnValue(res as never);
  res.json = vi.fn().mockReturnValue(res as never);
  return res as { status: Mock; json: Mock };
};

describe('internalKey middleware', () => {
  it('calls next when the header matches', () => {
    const req = { headers: { authorization: 'Bearer expected-key' } } as never;
    const res = mkRes();
    const next = vi.fn();

    internalKey(req, res as never, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 401 when header is missing', () => {
    const req = { headers: {} } as never;
    const res = mkRes();
    const next = vi.fn();

    internalKey(req, res as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 when key is wrong', () => {
    const req = { headers: { authorization: 'Bearer wrong' } } as never;
    const res = mkRes();
    const next = vi.fn();

    internalKey(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
