// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.FRONTEND_RESET_PASSWORD_URL = 'https://test.example.com/reset-password';

// ---------------------------------------------------------------------------
// LoggingService mock — must be registered before any imports that trigger side effects
// ---------------------------------------------------------------------------

const mockLoggingInfo = jest.fn();
const mockLoggingError = jest.fn();

jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    info: mockLoggingInfo,
    error: mockLoggingError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loggingService: {
    info: mockLoggingInfo,
    error: mockLoggingError,
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// SupabaseService mock — prevent real client instantiation
// ---------------------------------------------------------------------------

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminCreateAuthUser: jest.fn(),
    adminDeleteAuthUser: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminCreateAuthUser: jest.fn(),
    adminDeleteAuthUser: jest.fn(),
    signInWithPassword: jest.fn(),
    signOut: jest.fn(),
  },
}));

import { authService } from '@src/services/auth.service';
import { authRepository } from '@src/repositories/auth.repository';
import { TenantNotFoundError, AgentCodeInvalidError, InvalidCredentialsError } from '@src/models/errors/auth.errors';
import { ServiceError } from '@src/models/errors/layer.errors';
import type { ITenant, IAgentCode, IUser } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID = 'ffffffff-0000-1111-2222-333333333333';
const AGENT_CODE_ID = '44444444-5555-6666-7777-888888888888';
const GROUP_ID = '99999999-aaaa-bbbb-cccc-dddddddddddd';

const mockTenant: ITenant = {
  id: TENANT_ID,
  slug: 'acme',
  name: 'Acme Corp',
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
};

const mockAgentCode: IAgentCode = {
  id: AGENT_CODE_ID,
  tenant_id: TENANT_ID,
  agent_code: 'AGT-001',
  user_id: null,
  is_used: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const mockUser: IUser = {
  id: USER_ID,
  tenant_id: TENANT_ID,
  email: 'jane.doe@example.com',
  name: 'Jane Doe',
  role: 'agent',
  agent_code: 'AGT-001',
  location: 'Sydney',
  group_id: GROUP_ID,
  phone: null,
  agency: null,
  status: 'active',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const REGISTER_PARAMS = {
  tenantSlug: 'acme',
  fullName: 'Jane Doe',
  agentCode: 'AGT-001',
  email: 'jane.doe@example.com',
  password: 'Secret1!',
  groupId: GROUP_ID,
  location: 'Sydney',
};

/******************************************************************************
  Test suite — AuthService.register
******************************************************************************/

describe('AuthService.register', () => {
  afterEach(() => jest.restoreAllMocks());

  it('happy path — all steps succeed, returns { user, token }', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.mock-token';

    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'findAgentCode').mockResolvedValue(mockAgentCode);
    jest.spyOn(authRepository, 'createAuthUser').mockResolvedValue({ id: USER_ID });
    jest.spyOn(authRepository, 'insertUser').mockResolvedValue(mockUser);
    jest.spyOn(authRepository, 'updateAgentCode').mockResolvedValue(undefined);
    jest.spyOn(authRepository, 'signInWithPassword').mockResolvedValue({ userId: USER_ID, token });

    const result = await authService.register(REGISTER_PARAMS);

    expect(result).toEqual({ user: mockUser, token });
  });

  it('token is null when signInWithPassword returns null — service returns { user, token: null } without throwing', async () => {
    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'findAgentCode').mockResolvedValue(mockAgentCode);
    jest.spyOn(authRepository, 'createAuthUser').mockResolvedValue({ id: USER_ID });
    jest.spyOn(authRepository, 'insertUser').mockResolvedValue(mockUser);
    jest.spyOn(authRepository, 'updateAgentCode').mockResolvedValue(undefined);
    jest.spyOn(authRepository, 'signInWithPassword').mockResolvedValue(null);

    const result = await authService.register(REGISTER_PARAMS);

    expect(result).toEqual({ user: mockUser, token: null });
  });

  it('throws TenantNotFoundError when findTenantBySlug returns null', async () => {
    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(null);

    await expect(authService.register(REGISTER_PARAMS)).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('throws AgentCodeInvalidError when findAgentCode returns null', async () => {
    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'findAgentCode').mockResolvedValue(null);

    await expect(authService.register(REGISTER_PARAMS)).rejects.toBeInstanceOf(AgentCodeInvalidError);
  });

  it('calls deleteAuthUser (rollback) when insertUser throws, then rethrows wrapped in ServiceError', async () => {
    const insertError = new Error('insert failed: duplicate key');

    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'findAgentCode').mockResolvedValue(mockAgentCode);
    jest.spyOn(authRepository, 'createAuthUser').mockResolvedValue({ id: USER_ID });
    jest.spyOn(authRepository, 'insertUser').mockRejectedValue(insertError);
    const deleteAuthUserSpy = jest
      .spyOn(authRepository, 'deleteAuthUser')
      .mockResolvedValue(undefined);

    await expect(authService.register(REGISTER_PARAMS)).rejects.toBeInstanceOf(ServiceError);

    // Rollback was attempted exactly once
    expect(deleteAuthUserSpy).toHaveBeenCalledTimes(1);
    expect(deleteAuthUserSpy).toHaveBeenCalledWith(USER_ID);
  });

  it('propagates the original insertError (not the rollback error) when both insertUser and deleteAuthUser throw', async () => {
    const insertError = new Error('insert failed: constraint violation');
    const rollbackError = new Error('rollback failed: user not found in auth');

    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'findAgentCode').mockResolvedValue(mockAgentCode);
    jest.spyOn(authRepository, 'createAuthUser').mockResolvedValue({ id: USER_ID });
    jest.spyOn(authRepository, 'insertUser').mockRejectedValue(insertError);
    jest.spyOn(authRepository, 'deleteAuthUser').mockRejectedValue(rollbackError);

    let thrownError: unknown;
    try {
      await authService.register(REGISTER_PARAMS);
    } catch (err) {
      thrownError = err;
    }

    // A ServiceError is thrown (the outer handleServiceError wraps the insertError)
    expect(thrownError).toBeInstanceOf(ServiceError);

    // The cause should ultimately trace back to the insertError
    const serviceErr = thrownError as ServiceError;
    expect(serviceErr.cause).toBe(insertError);

    // The rollback error was logged as a warning
    expect(mockLoggingError).toHaveBeenCalledWith(
      expect.stringContaining('rollback failed'),
      rollbackError,
      expect.objectContaining({ authUserId: USER_ID }),
    );
  });
});

/******************************************************************************
  Test suite — AuthService.login
******************************************************************************/

const LOGIN_PARAMS = {
  tenantSlug: 'acme',
  email: 'jane.doe@example.com',
  password: 'Secret1!',
};

describe('AuthService.login', () => {
  afterEach(() => jest.restoreAllMocks());

  it('happy path — returns { user, token } when all steps succeed', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.mock-token';

    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'signInWithPassword').mockResolvedValue({ userId: USER_ID, token });
    jest.spyOn(authRepository, 'findUserById').mockResolvedValue(mockUser);

    const result = await authService.login(LOGIN_PARAMS);

    expect(result).toEqual({ user: mockUser, token });
  });

  it('throws TenantNotFoundError when findTenantBySlug returns null', async () => {
    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(null);

    await expect(authService.login(LOGIN_PARAMS)).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it('throws InvalidCredentialsError when signInWithPassword returns null', async () => {
    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'signInWithPassword').mockResolvedValue(null);

    await expect(authService.login(LOGIN_PARAMS)).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError when findUserById returns null', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.mock-token';

    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'signInWithPassword').mockResolvedValue({ userId: USER_ID, token });
    jest.spyOn(authRepository, 'findUserById').mockResolvedValue(null);

    await expect(authService.login(LOGIN_PARAMS)).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('throws InvalidCredentialsError when user tenant_id does not match resolved tenant', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.mock-token';
    const differentTenantUser: IUser = {
      ...mockUser,
      tenant_id: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    };

    jest.spyOn(authRepository, 'findTenantBySlug').mockResolvedValue(mockTenant);
    jest.spyOn(authRepository, 'signInWithPassword').mockResolvedValue({ userId: USER_ID, token });
    jest.spyOn(authRepository, 'findUserById').mockResolvedValue(differentTenantUser);

    await expect(authService.login(LOGIN_PARAMS)).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

/******************************************************************************
  Test suite — AuthService.logout
******************************************************************************/

const LOGOUT_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.mock-logout-token';

describe('AuthService.logout', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls authRepository.signOut with the token and resolves void', async () => {
    const signOutSpy = jest.spyOn(authRepository, 'signOut').mockResolvedValue(undefined);

    await expect(authService.logout(LOGOUT_TOKEN)).resolves.toBeUndefined();

    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(signOutSpy).toHaveBeenCalledWith(LOGOUT_TOKEN);
  });

  it('calls handleServiceError when authRepository.signOut throws', async () => {
    jest.spyOn(authRepository, 'signOut').mockRejectedValue(new Error('signout db failure'));

    await expect(authService.logout(LOGOUT_TOKEN)).rejects.toBeInstanceOf(ServiceError);
  });
});
