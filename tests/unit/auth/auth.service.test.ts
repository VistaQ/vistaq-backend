import jwt from 'jsonwebtoken';

const mockFindByCode = jest.fn();
const mockClaim = jest.fn();
const mockRelease = jest.fn();
const mockInsertUser = jest.fn();
const mockFindById = jest.fn();
const mockCreateUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockStartLogin = jest.fn();
const mockVerifyLogin = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@src/repositories/agentCode.repository', () => ({
  __esModule: true,
  default: {
    findByCode: mockFindByCode,
    claim: mockClaim,
    release: mockRelease,
  },
}));

jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: { insertUser: mockInsertUser, findById: mockFindById },
}));

jest.mock('@src/services/cognito.service', () => ({
  __esModule: true,
  default: {
    createUser: mockCreateUser,
    deleteUser: mockDeleteUser,
    startLogin: mockStartLogin,
    verifyLogin: mockVerifyLogin,
    signOut: mockSignOut,
  },
}));

import {
  AgentCodeInvalidError,
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserInactiveError,
} from '@src/models/errors/auth.errors';
import { CognitoRateLimitedError } from '@src/models/errors/cognito.error';
import { ServiceError } from '@src/models/errors/layer.errors';
import authService from '@src/services/auth.service';

const registerParams = {
  fullName: 'Ann Agent',
  agentCode: 'A100',
  email: 'Ann@Example.com',
  groupId: 'g1',
  location: 'KL',
};

const activeUser = { id: 'sub-1', email: 'ann@example.com', status: 'active' };
const accessToken = jwt.sign({ sub: 'sub-1' }, 'test-secret');
const tokens = {
  accessToken,
  refreshToken: 'r',
  idToken: 'i',
  expiresIn: 900,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockRelease.mockResolvedValue(undefined);
  mockDeleteUser.mockResolvedValue(undefined);
  mockSignOut.mockResolvedValue(undefined);
});

describe('AuthService.register', () => {
  beforeEach(() => {
    mockFindByCode.mockResolvedValue({ agent_code: 'A100', is_used: false });
    mockCreateUser.mockResolvedValue({ id: 'sub-1' });
    mockClaim.mockResolvedValue(undefined);
    mockInsertUser.mockResolvedValue(activeUser);
  });

  it('creates the Cognito user, claims the code and stores an agent user without a token', async () => {
    const result = await authService.register(registerParams);

    expect(mockCreateUser).toHaveBeenCalledWith('ann@example.com');
    expect(mockClaim).toHaveBeenCalledWith('A100', 'sub-1');
    expect(mockInsertUser).toHaveBeenCalledWith({
      id: 'sub-1',
      email: 'ann@example.com',
      name: 'Ann Agent',
      role: 'agent',
      agent_code: 'A100',
      location: 'KL',
      group_id: 'g1',
    });
    expect(result).toEqual({ user: activeUser });
  });

  it.each([
    ['is unknown', null],
    ['is already used', { agent_code: 'A100', is_used: true }],
  ])('rejects an agent code that %s and creates nothing', async (_name, record) => {
    mockFindByCode.mockResolvedValue(record);

    await expect(authService.register(registerParams)).rejects.toBeInstanceOf(
      AgentCodeInvalidError,
    );
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate email without touching the agent code', async () => {
    mockCreateUser.mockRejectedValue(new UserAlreadyExistsError());

    await expect(authService.register(registerParams)).rejects.toBeInstanceOf(
      UserAlreadyExistsError,
    );
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it('deletes the Cognito user when another request claims the code first', async () => {
    mockClaim.mockRejectedValue(new AgentCodeInvalidError());

    await expect(authService.register(registerParams)).rejects.toBeInstanceOf(
      AgentCodeInvalidError,
    );
    expect(mockDeleteUser).toHaveBeenCalledWith('ann@example.com');
    expect(mockInsertUser).not.toHaveBeenCalled();
  });

  it('releases the code and deletes the Cognito user when storing the user fails', async () => {
    mockInsertUser.mockRejectedValue(new Error('write failed'));

    await expect(authService.register(registerParams)).rejects.toBeInstanceOf(
      ServiceError,
    );
    expect(mockRelease).toHaveBeenCalledWith('A100');
    expect(mockDeleteUser).toHaveBeenCalledWith('ann@example.com');
  });
});

describe('AuthService.login', () => {
  it('lowercases the email and returns the session', async () => {
    mockStartLogin.mockResolvedValue({ session: 'sess' });

    const result = await authService.login('Ann@Example.com');

    expect(mockStartLogin).toHaveBeenCalledWith('ann@example.com');
    expect(result).toEqual({ session: 'sess' });
  });

  it.each([
    ['invalid credentials', new InvalidCredentialsError()],
    ['rate limiting', new CognitoRateLimitedError()],
  ])('passes %s through unwrapped', async (_name, error) => {
    mockStartLogin.mockRejectedValue(error);

    await expect(authService.login('a@b.co')).rejects.toBe(error);
  });
});

describe('AuthService.verifyLogin', () => {
  const params = { email: 'Ann@Example.com', session: 'sess', code: '123456' };

  it('returns the stored user with the tokens', async () => {
    mockVerifyLogin.mockResolvedValue(tokens);
    mockFindById.mockResolvedValue(activeUser);

    const result = await authService.verifyLogin(params);

    expect(mockVerifyLogin).toHaveBeenCalledWith('ann@example.com', 'sess', '123456');
    expect(mockFindById).toHaveBeenCalledWith('sub-1', { consistent: true });
    expect(result).toEqual({ user: activeUser, tokens });
  });

  it('rejects an inactive user and revokes the tokens', async () => {
    mockVerifyLogin.mockResolvedValue(tokens);
    mockFindById.mockResolvedValue({ ...activeUser, status: 'inactive' });

    await expect(authService.verifyLogin(params)).rejects.toBeInstanceOf(
      UserInactiveError,
    );
    expect(mockSignOut).toHaveBeenCalledWith(accessToken);
  });

  it('rejects a Cognito user with no stored user and revokes the tokens', async () => {
    mockVerifyLogin.mockResolvedValue(tokens);
    mockFindById.mockResolvedValue(null);

    await expect(authService.verifyLogin(params)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(mockSignOut).toHaveBeenCalledWith(accessToken);
  });

  it('passes a wrong or expired code through as invalid credentials', async () => {
    mockVerifyLogin.mockRejectedValue(new InvalidCredentialsError());

    await expect(authService.verifyLogin(params)).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(mockFindById).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout, me and getUserContext', () => {
  it('logout signs the access token out', async () => {
    await authService.logout('tok');

    expect(mockSignOut).toHaveBeenCalledWith('tok');
  });

  it('logout wraps a Cognito failure', async () => {
    mockSignOut.mockRejectedValue(new Error('down'));

    await expect(authService.logout('tok')).rejects.toBeInstanceOf(ServiceError);
  });

  it('getUserContext reads the user with a strongly consistent read', async () => {
    mockFindById.mockResolvedValue(activeUser);

    expect(await authService.getUserContext('sub-1')).toBe(activeUser);
    expect(mockFindById).toHaveBeenCalledWith('sub-1', { consistent: true });
  });

  it('me reads the user without forcing a consistent read', async () => {
    mockFindById.mockResolvedValue(activeUser);

    await authService.me('sub-1');

    expect(mockFindById).toHaveBeenCalledWith('sub-1');
  });
});
