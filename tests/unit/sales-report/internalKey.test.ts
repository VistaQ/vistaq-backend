import { internalKey } from '@src/middleware/internalKey';

beforeEach(() => {
  process.env.INTERNAL_API_KEY = 'expected-key';
});

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
