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
const mockCount = jest.fn();
const mockDistribution = jest.fn();
const mockGauge = jest.fn();
const mockStartSpan = jest.fn(
  (_opts: unknown, fn: () => Promise<unknown>) => fn(),
);

jest.mock('@sentry/node', () => ({
  __esModule: true,
  metrics: {
    count: mockCount,
    distribution: mockDistribution,
    gauge: mockGauge,
  },
  startSpan: mockStartSpan,
}));

import {
  emitHttpMetrics,
  emitDbMetrics,
  emitRegistration,
  emitLogin,
  emitProspectStageTransition,
  emitSessionJoin,
  emitActiveUser,
  emitErrorCount,
  withServiceSpan,
} from '@src/utils/sentry.metrics';

/******************************************************************************
  Helpers
******************************************************************************/

beforeEach(() => {
  jest.clearAllMocks();
});

/******************************************************************************
  1. emitHttpMetrics
******************************************************************************/

describe('emitHttpMetrics', () => {
  it('emits http.request.count with method, route, and status_class attributes', () => {
    emitHttpMetrics('GET', '/api/users', 200, 50);

    expect(mockCount).toHaveBeenCalledWith('http.request.count', 1, {
      attributes: { method: 'GET', route: '/api/users', status_class: '2xx' },
    });
  });

  it('emits http.request.duration as a distribution', () => {
    emitHttpMetrics('POST', '/api/auth/login', 200, 120);

    expect(mockDistribution).toHaveBeenCalledWith('http.request.duration', 120, {
      unit: 'millisecond',
      attributes: { method: 'POST', route: '/api/auth/login' },
    });
  });

  it('classifies 4xx responses as status_class 4xx', () => {
    emitHttpMetrics('GET', '/api/users/unknown', 404, 10);

    expect(mockCount).toHaveBeenCalledWith(
      'http.request.count',
      1,
      expect.objectContaining({ attributes: expect.objectContaining({ status_class: '4xx' }) }),
    );
  });

  it('classifies 5xx responses as status_class 5xx', () => {
    emitHttpMetrics('GET', '/api/users', 500, 10);

    expect(mockCount).toHaveBeenCalledWith(
      'http.request.count',
      1,
      expect.objectContaining({ attributes: expect.objectContaining({ status_class: '5xx' }) }),
    );
  });

  it('emits http.error.count for 4xx responses', () => {
    emitHttpMetrics('GET', '/api/users/x', 404, 10);

    expect(mockCount).toHaveBeenCalledWith('http.error.count', 1, {
      attributes: { method: 'GET', route: '/api/users/x', status_code: '404', status_class: '4xx' },
    });
  });

  it('emits http.error.count for 5xx responses', () => {
    emitHttpMetrics('POST', '/api/users', 500, 10);

    expect(mockCount).toHaveBeenCalledWith('http.error.count', 1, {
      attributes: { method: 'POST', route: '/api/users', status_code: '500', status_class: '5xx' },
    });
  });

  it('does NOT emit http.error.count for 2xx responses', () => {
    emitHttpMetrics('GET', '/api/users', 200, 50);

    const errorCalls = (mockCount as jest.Mock).mock.calls.filter(
      (call: unknown[]) => call[0] === 'http.error.count',
    );
    expect(errorCalls).toHaveLength(0);
  });

  it('does not throw when Sentry throws internally', () => {
    mockCount.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitHttpMetrics('GET', '/api/users', 200, 50)).not.toThrow();
  });
});

/******************************************************************************
  2. emitDbMetrics
******************************************************************************/

describe('emitDbMetrics', () => {
  it('emits db.query.duration distribution with table and operation attributes', () => {
    emitDbMetrics('users', 'db.query', 35);

    expect(mockDistribution).toHaveBeenCalledWith('db.query.duration', 35, {
      unit: 'millisecond',
      attributes: { table: 'users', operation: 'db.query' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockDistribution.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitDbMetrics('users', 'db.query', 10)).not.toThrow();
  });
});

/******************************************************************************
  3. Business metric emitters
******************************************************************************/

describe('emitRegistration', () => {
  it('counts business.registration with tenant_id attribute', () => {
    emitRegistration('tenant-abc');

    expect(mockCount).toHaveBeenCalledWith('business.registration', 1, {
      attributes: { tenant_id: 'tenant-abc' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockCount.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitRegistration('tenant-abc')).not.toThrow();
  });
});

describe('emitLogin', () => {
  it('counts business.login with outcome:success attribute on success', () => {
    emitLogin('tenant-abc', true);

    expect(mockCount).toHaveBeenCalledWith('business.login', 1, {
      attributes: { tenant_id: 'tenant-abc', outcome: 'success' },
    });
  });

  it('counts business.login with outcome:failure attribute on failure', () => {
    emitLogin('tenant-abc', false);

    expect(mockCount).toHaveBeenCalledWith('business.login', 1, {
      attributes: { tenant_id: 'tenant-abc', outcome: 'failure' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockCount.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitLogin('tenant-abc', true)).not.toThrow();
  });
});

describe('emitProspectStageTransition', () => {
  it('counts business.prospect.stage_transition with from/to stage attributes', () => {
    emitProspectStageTransition('tenant-abc', 'prospect', 'appointment');

    expect(mockCount).toHaveBeenCalledWith('business.prospect.stage_transition', 1, {
      attributes: { tenant_id: 'tenant-abc', from_stage: 'prospect', to_stage: 'appointment' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockCount.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() =>
      emitProspectStageTransition('tenant-abc', 'prospect', 'appointment'),
    ).not.toThrow();
  });
});

describe('emitSessionJoin', () => {
  it('counts business.session.join with tenant_id attribute', () => {
    emitSessionJoin('tenant-abc');

    expect(mockCount).toHaveBeenCalledWith('business.session.join', 1, {
      attributes: { tenant_id: 'tenant-abc' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockCount.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitSessionJoin('tenant-abc')).not.toThrow();
  });
});

describe('emitActiveUser', () => {
  it('calls Sentry.metrics.gauge with value 1 and tenant_id attribute', () => {
    emitActiveUser('tenant-abc');

    expect(mockGauge).toHaveBeenCalledWith('business.active_users', 1, {
      attributes: { tenant_id: 'tenant-abc' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockGauge.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitActiveUser('tenant-abc')).not.toThrow();
  });
});

/******************************************************************************
  4. emitErrorCount
******************************************************************************/

describe('emitErrorCount', () => {
  it('counts error.count with error_type and context attributes', () => {
    emitErrorCount('RouteError', 'UserController.getById');

    expect(mockCount).toHaveBeenCalledWith('error.count', 1, {
      attributes: { error_type: 'RouteError', context: 'UserController.getById' },
    });
  });

  it('does not throw when Sentry throws internally', () => {
    mockCount.mockImplementationOnce(() => { throw new Error('Sentry down'); });
    expect(() => emitErrorCount('Error', 'SomeController.method')).not.toThrow();
  });
});

/******************************************************************************
  5. withServiceSpan
******************************************************************************/

describe('withServiceSpan', () => {
  it('creates a span with the correct op and name', async () => {
    await withServiceSpan('AuthService', 'register', { tenant_slug: 'acme' }, async () => 'ok');

    expect(mockStartSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        op: 'service.AuthService',
        name: 'AuthService.register',
      }),
      expect.any(Function),
    );
  });

  it('passes attributes with undefined values stripped', async () => {
    await withServiceSpan(
      'GroupService',
      'createGroup',
      { tenant_id: 'tenant-abc', optional: undefined },
      async () => 'ok',
    );

    expect(mockStartSpan).toHaveBeenCalledWith(
      expect.objectContaining({
        attributes: { tenant_id: 'tenant-abc' },
      }),
      expect.any(Function),
    );
  });

  it('returns the value from the wrapped fn', async () => {
    const result = await withServiceSpan('SomeService', 'someMethod', {}, async () => 42);
    expect(result).toBe(42);
  });

  it('propagates errors thrown by the wrapped fn', async () => {
    await expect(
      withServiceSpan('SomeService', 'someMethod', {}, async () => {
        throw new Error('service error');
      }),
    ).rejects.toThrow('service error');
  });

  it('calls fn directly if Sentry.startSpan throws', async () => {
    mockStartSpan.mockImplementationOnce(() => { throw new Error('span creation failed'); });
    const result = await withServiceSpan('SomeService', 'someMethod', {}, async () => 'fallback');
    expect(result).toBe('fallback');
  });
});
