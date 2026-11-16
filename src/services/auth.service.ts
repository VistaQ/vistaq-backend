import jwt from 'jsonwebtoken';

import {
  AgentCodeInvalidError,
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserInactiveError,
} from '@src/models/errors/auth.errors';
import { CognitoRateLimitedError } from '@src/models/errors/cognito.error';
import agentCodeRepository from '@src/repositories/agentCode.repository';
import userRepository from '@src/repositories/user.repository';
import cognitoService, { type ITokens } from '@src/services/cognito.service';
import type { IUser, IUserContext } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IRegisterParams {
  fullName: string;
  agentCode: string;
  email: string;
  groupId: string;
  location: string;
}

interface IVerifyLoginParams {
  email: string;
  session: string;
  code: string;
}

interface IVerifyLoginResult {
  user: IUser;
  tokens: ITokens;
}

const DOMAIN_ERRORS = [
  AgentCodeInvalidError,
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserInactiveError,
  CognitoRateLimitedError,
];

function isDomainError(error: unknown): boolean {
  return DOMAIN_ERRORS.some((type) => error instanceof type);
}

/******************************************************************************
                            AuthService
******************************************************************************/

class AuthService {
  async register(params: IRegisterParams): Promise<{ user: IUser }> {
    try {
      const email = params.email.toLowerCase();

      const agentCode = await agentCodeRepository.findByCode(params.agentCode, {
        consistent: true,
      });
      if (!agentCode || agentCode.is_used) {
        throw new AgentCodeInvalidError();
      }

      const authUser = await cognitoService.createUser(email);

      try {
        await agentCodeRepository.claim(params.agentCode, authUser.id);
      } catch (claimError) {
        await cognitoService.deleteUser(email).catch(() => undefined);
        throw claimError;
      }

      try {
        const user = await userRepository.insertUser({
          id: authUser.id,
          email,
          name: params.fullName,
          role: 'agent',
          agent_code: params.agentCode,
          location: params.location,
          group_id: params.groupId,
        });
        return { user };
      } catch (insertError) {
        await agentCodeRepository.release(params.agentCode).catch(() => undefined);
        await cognitoService.deleteUser(email).catch(() => undefined);
        throw insertError;
      }
    } catch (error) {
      if (isDomainError(error)) {
        throw error;
      }
      return handleServiceError('AuthService.register', error);
    }
  }

  /** Emails a sign-in code and returns the session that must accompany it. */
  async login(email: string): Promise<{ session: string }> {
    try {
      return await cognitoService.startLogin(email.toLowerCase());
    } catch (error) {
      if (isDomainError(error)) {
        throw error;
      }
      return handleServiceError('AuthService.login', error);
    }
  }

  async verifyLogin(params: IVerifyLoginParams): Promise<IVerifyLoginResult> {
    try {
      const tokens = await cognitoService.verifyLogin(
        params.email.toLowerCase(),
        params.session,
        params.code,
      );

      const subject = (jwt.decode(tokens.accessToken) as { sub?: string } | null)
        ?.sub;
      const user = subject
        ? await userRepository.findById(subject, { consistent: true })
        : null;

      if (!user || user.status !== 'active') {
        await cognitoService.signOut(tokens.accessToken).catch(() => undefined);
        throw user ? new UserInactiveError() : new InvalidCredentialsError();
      }

      return { user, tokens };
    } catch (error) {
      if (isDomainError(error)) {
        throw error;
      }
      return handleServiceError('AuthService.verifyLogin', error);
    }
  }

  async logout(accessToken: string): Promise<void> {
    try {
      const subject = (jwt.decode(accessToken) as { sub?: string } | null)?.sub;
      if (subject) {
        await userRepository.markSignedOut(subject);
      }
      await cognitoService.signOut(accessToken);
    } catch (error) {
      return handleServiceError('AuthService.logout', error);
    }
  }

  async me(userId: string): Promise<IUser | null> {
    try {
      return await userRepository.findById(userId);
    } catch (error) {
      return handleServiceError('AuthService.me', error);
    }
  }

  async getUserContext(userId: string): Promise<IUserContext | null> {
    try {
      return await userRepository.findContextById(userId);
    } catch (error) {
      return handleServiceError('AuthService.getUserContext', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const authService = new AuthService();
export default authService;
