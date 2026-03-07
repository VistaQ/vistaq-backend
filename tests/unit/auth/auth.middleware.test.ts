// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// ---------------------------------------------------------------------------
// LoggingService mock — must be registered before any imports that trigger side effects
// ---------------------------------------------------------------------------

jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loggingService: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

import { validate } from '@src/middleware/validate';
import { registerSchema, loginSchema } from '@src/routes/auth.routes';

/******************************************************************************
  Helpers
******************************************************************************/

function makeReqResNext(body: unknown): {
  req: Request;
  res: Response;
  next: jest.Mock;
} {
  const req = { body } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn() as jest.Mock;
  return { req, res, next };
}

const VALID_BODY = {
  fullName: 'Jane Doe',
  agentCode: 'AGT-001',
  email: 'jane.doe@example.com',
  password: 'Secret1!',
  groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  location: 'Sydney',
};

/******************************************************************************
  Test suite — validate middleware factory (using registerSchema)
******************************************************************************/

describe('validate middleware — registerSchema', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls next() with no argument and assigns parsed result to req.body when body is valid', () => {
    const { req, res, next } = makeReqResNext({ ...VALID_BODY });

    const middleware = validate(registerSchema);
    middleware(req, res, next as NextFunction);

    // next() called once with no arguments (i.e. not an error)
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(/* nothing */);

    // Parsed body is assigned back to req.body
    expect(req.body).toEqual(VALID_BODY);

    // res was NOT used
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns HTTP 400 with Validation failed when a required field is missing', () => {
    const { fullName: _omitted, ...bodyWithoutFullName } = VALID_BODY;
    const { req, res, next } = makeReqResNext(bodyWithoutFullName);

    const middleware = validate(registerSchema);
    middleware(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed', errors: expect.any(Array) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns HTTP 400 when password fails regex constraints', () => {
    // "password" has no uppercase, no special character, no digit
    const { req, res, next } = makeReqResNext({ ...VALID_BODY, password: 'weakpassword' });

    const middleware = validate(registerSchema);
    middleware(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed', errors: expect.any(Array) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next(error) when a non-Zod error is thrown inside schema.parse', () => {
    const boom = new Error('unexpected schema explosion');

    // Create a schema that always throws a plain Error (not a ZodError)
    const faultySchema = {
      parse: () => { throw boom; },
    } as unknown as ZodSchema;

    const { req, res, next } = makeReqResNext({ ...VALID_BODY });
    const middleware = validate(faultySchema);
    middleware(req, res, next as NextFunction);

    // next called with the non-Zod error — flows to error-handling middleware
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(boom);

    // No response sent
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

/******************************************************************************
  Test suite — validate middleware factory (using loginSchema)
******************************************************************************/

const VALID_LOGIN_BODY = {
  email: 'test@example.com',
  password: 'anypassword',
};

describe('validate middleware — loginSchema', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls next() with no argument when body is valid', () => {
    const { req, res, next } = makeReqResNext({ ...VALID_LOGIN_BODY });

    const middleware = validate(loginSchema);
    middleware(req, res, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(/* nothing */);

    expect(req.body).toEqual(VALID_LOGIN_BODY);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('returns HTTP 400 with "Validation failed" when email is missing', () => {
    const { password } = VALID_LOGIN_BODY;
    const { req, res, next } = makeReqResNext({ password });

    const middleware = validate(loginSchema);
    middleware(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed', errors: expect.any(Array) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns HTTP 400 with "Validation failed" when email format is invalid', () => {
    const { req, res, next } = makeReqResNext({ ...VALID_LOGIN_BODY, email: 'not-an-email' });

    const middleware = validate(loginSchema);
    middleware(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed', errors: expect.any(Array) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns HTTP 400 with "Validation failed" when password is missing', () => {
    const { email } = VALID_LOGIN_BODY;
    const { req, res, next } = makeReqResNext({ email });

    const middleware = validate(loginSchema);
    middleware(req, res, next as NextFunction);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed', errors: expect.any(Array) }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
