import type { NextFunction } from 'express';

/******************************************************************************
  Mocks — must be set up before any module under test is imported
******************************************************************************/

// Mock EnvVars so the env validation guards don't throw during import
jest.mock('@src/utils/env', () => ({
  __esModule: true,
  default: {
    NodeEnv: 'test',
    Port: 3000,
    SupabaseUrl: 'https://mock.supabase.co',
    SupabaseAnonKey: 'mock-anon-key',
    SupabaseServiceRoleKey: 'mock-service-role-key',
  },
  NodeEnvs: { DEV: 'development', TEST: 'test', PRODUCTION: 'production' },
}));

// Mock @sentry/node
const mockSetFingerprint = jest.fn();
const mockSetLevel = jest.fn();
const mockSetExtra = jest.fn();

jest.mock('@sentry/node', () => ({
  __esModule: true,
  withScope: jest.fn((cb: (scope: unknown) => void) => {
    cb({
      setFingerprint: mockSetFingerprint,
      setLevel: mockSetLevel,
      setExtra: mockSetExtra,
    });
  }),
  addBreadcrumb: jest.fn(),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock pino to suppress output during tests
jest.mock('pino', () => {
  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return jest.fn(() => mockLogger);
});

import * as Sentry from '@sentry/node';
import { getRootCause } from '@src/utils/sentry.utils';
import { handleControllerError } from '@src/utils/errorHandlers';
import { RouteError } from '@src/models/errors/route.error';
import {
  ControllerError,
  ServiceError,
  RepositoryError,
} from '@src/models/errors/layer.errors';
import loggingService, { asyncLocalStorage } from '@src/services/logging.service';

/******************************************************************************
  1. getRootCause utility
******************************************************************************/

describe('getRootCause', () => {
  it('returns the error itself when it has no cause', () => {
    const err = new Error('no cause');
    expect(getRootCause(err)).toBe(err);
  });

  it('returns the cause when there is one level of nesting', () => {
    const root = new Error('root');
    const wrapper = new Error('wrapper');
    (wrapper as unknown as { cause: Error }).cause = root;
    expect(getRootCause(wrapper)).toBe(root);
  });

  it('returns the deepest cause in a multi-level chain', () => {
    const deepest = new Error('deepest');
    const mid = new Error('mid');
    (mid as unknown as { cause: Error }).cause = deepest;
    const outer = new Error('outer');
    (outer as unknown as { cause: Error }).cause = mid;
    expect(getRootCause(outer)).toBe(deepest);
  });

  it('returns non-Error input as-is', () => {
    expect(getRootCause('string-error')).toBe('string-error');
    expect(getRootCause(42)).toBe(42);
    expect(getRootCause(null)).toBe(null);
    expect(getRootCause(undefined)).toBeUndefined();
  });

  it('stops when cause is not an Error instance', () => {
    const err = new Error('has non-error cause');
    (err as unknown as { cause: string }).cause = 'not an error';
    // cause is not an Error, so getRootCause returns `err` itself
    expect(getRootCause(err)).toBe(err);
  });
});

/******************************************************************************
  2. LoggingService dual-write (Pino + Sentry)
******************************************************************************/

describe('LoggingService Sentry dual-write', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls Sentry.logger.info and Sentry.addBreadcrumb on info()', () => {
    loggingService.info('test message', { key: 'value' });

    expect(Sentry.logger.info).toHaveBeenCalledWith(
      'test message',
      expect.objectContaining({ key: 'value' }),
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'log',
        level: 'info',
        message: 'test message',
      }),
    );
  });

  it('calls Sentry.logger.warn and breadcrumb on warn()', () => {
    loggingService.warn('warning msg', { detail: 'x' });

    expect(Sentry.logger.warn).toHaveBeenCalledWith(
      'warning msg',
      expect.objectContaining({ detail: 'x' }),
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'log',
        level: 'warning',
        message: 'warning msg',
      }),
    );
  });

  it('calls Sentry.logger.error and breadcrumb on error()', () => {
    const err = new Error('boom');
    loggingService.error('error msg', err, { extra: 'data' });

    expect(Sentry.logger.error).toHaveBeenCalledWith(
      'error msg',
      expect.objectContaining({ error: 'boom', extra: 'data' }),
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'log',
        level: 'error',
        message: 'error msg',
      }),
    );
  });

  it('calls Sentry.logger.debug and breadcrumb on debug()', () => {
    loggingService.debug('debug msg');

    expect(Sentry.logger.debug).toHaveBeenCalledWith(
      'debug msg',
      expect.any(Object),
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'log',
        level: 'debug',
        message: 'debug msg',
      }),
    );
  });

  it('includes correlationId in Sentry params when available', () => {
    asyncLocalStorage.run({ correlationId: 'abc-123' }, () => {
      loggingService.info('correlated message');

      expect(Sentry.logger.info).toHaveBeenCalledWith(
        'correlated message',
        expect.objectContaining({ correlationId: 'abc-123' }),
      );
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ correlationId: 'abc-123' }),
        }),
      );
    });
  });

  it('does not throw when Sentry.logger throws internally', () => {
    (Sentry.logger.info as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Sentry is down');
    });

    expect(() => loggingService.info('should not throw')).not.toThrow();
  });

  it('does not throw when Sentry.addBreadcrumb throws internally', () => {
    (Sentry.addBreadcrumb as jest.Mock).mockImplementationOnce(() => {
      throw new Error('breadcrumb failure');
    });

    expect(() => loggingService.info('should not throw')).not.toThrow();
  });
});

/******************************************************************************
  3. handleControllerError Sentry scope
******************************************************************************/

describe('handleControllerError Sentry scope', () => {
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();
  });

  it('calls Sentry.withScope', () => {
    const err = new Error('test error');
    handleControllerError('TestController.method', err, mockNext);
    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
  });

  it('calls next() with a ControllerError', () => {
    const err = new Error('test error');
    handleControllerError('TestController.method', err, mockNext);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext.mock.calls[0][0]).toBeInstanceOf(ControllerError);
  });

  it('sets fingerprint with Error name and message for generic errors', () => {
    const err = new Error('generic failure');
    handleControllerError('TestController.method', err, mockNext);

    expect(mockSetFingerprint).toHaveBeenCalledWith(['Error', 'generic failure']);
    expect(mockSetLevel).toHaveBeenCalledWith('error');
  });

  it('sets fingerprint with RouteError constructor name, status, and message', () => {
    const routeErr = new RouteError(404, 'Not found');
    handleControllerError('TestController.method', routeErr, mockNext);

    expect(mockSetFingerprint).toHaveBeenCalledWith([
      'RouteError',
      '404',
      'Not found',
    ]);
  });

  it('sets level to warning for RouteError with status < 500', () => {
    const routeErr = new RouteError(400, 'Bad request');
    handleControllerError('TestController.method', routeErr, mockNext);

    expect(mockSetLevel).toHaveBeenCalledWith('warning');
  });

  it('sets level to error for RouteError with status >= 500', () => {
    const routeErr = new RouteError(500, 'Internal error');
    handleControllerError('TestController.method', routeErr, mockNext);

    expect(mockSetLevel).toHaveBeenCalledWith('error');
  });

  it('walks the cause chain to find the root cause for fingerprinting', () => {
    const rootCause = new RouteError(403, 'Forbidden');
    const serviceErr = new ServiceError('service failed', rootCause);
    handleControllerError('TestController.method', serviceErr, mockNext);

    expect(mockSetFingerprint).toHaveBeenCalledWith([
      'RouteError',
      '403',
      'Forbidden',
    ]);
    expect(mockSetLevel).toHaveBeenCalledWith('warning');
  });

  it('sets correlationId as extra when available in AsyncLocalStorage', () => {
    asyncLocalStorage.run({ correlationId: 'req-456' }, () => {
      const err = new Error('test');
      handleControllerError('TestController.method', err, mockNext);

      expect(mockSetExtra).toHaveBeenCalledWith('correlationId', 'req-456');
    });
  });

  it('does not set correlationId extra when not in async context', () => {
    const err = new Error('test');
    handleControllerError('TestController.method', err, mockNext);

    expect(mockSetExtra).not.toHaveBeenCalled();
  });
});
