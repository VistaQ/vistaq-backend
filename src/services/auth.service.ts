import {
  AgentCodeInvalidError,
  InvalidCredentialsError,
  TenantNotFoundError,
} from '@src/models/errors/auth.errors';
import authRepository from '@src/repositories/auth.repository';
import loggingService from '@src/services/logging.service';
import EnvVars from '@src/utils/env';
import { IUser } from '@src/types/auth.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import { emitLogin, emitRegistration, withServiceSpan } from '@src/utils/sentry.metrics';

/******************************************************************************
                            AuthService
******************************************************************************/

interface IRegisterParams {
  tenantSlug: string;
  fullName: string;
  agentCode: string;
  email: string;
  password: string;
  groupId: string;
  location: string;
}

interface IRegisterResult {
  user: IUser;
  token: string | null;
}

interface ILoginParams {
  tenantSlug: string;
  email: string;
  password: string;
}

interface ILoginResult {
  user: IUser;
  token: string;
}

interface IForgotPasswordParams {
  tenantSlug: string;
  email: string;
}

interface IResetPasswordParams {
  token: string;
  newPassword: string;
}

class AuthService {
  async register(params: IRegisterParams): Promise<IRegisterResult> {
    return withServiceSpan('AuthService', 'register', { tenant_slug: params.tenantSlug }, async () => {
    try {
      // Step 1 — Resolve tenant
      const tenant = await authRepository.findTenantBySlug(params.tenantSlug);
      if (!tenant) {
        throw new TenantNotFoundError();
      }

      // Step 2 — Validate agent code
      const agentCodeRecord = await authRepository.findAgentCode(
        params.agentCode,
        tenant.id,
      );
      if (!agentCodeRecord) {
        throw new AgentCodeInvalidError();
      }

      // Step 4a — Create Supabase Auth user
      const authUser = await authRepository.createAuthUser(
        params.email,
        params.password,
      );

      // Step 4b — Insert into users table (with rollback on failure)
      let user: IUser;
      try {
        user = await authRepository.insertUser({
          id: authUser.id,
          tenant_id: tenant.id,
          email: params.email,
          name: params.fullName,
          role: 'agent',
          agent_code: params.agentCode,
          location: params.location,
          group_id: params.groupId,
        });
      } catch (insertError) {
        loggingService.error(
          'AuthService.register — user insert failed, rolling back auth user',
          insertError,
          { authUserId: authUser.id },
        );
        try {
          await authRepository.deleteAuthUser(authUser.id);
        } catch (rollbackError) {
          loggingService.error(
            'AuthService.register — rollback failed, auth user may be orphaned',
            rollbackError,
            { authUserId: authUser.id },
          );
        }
        throw insertError;
      }

      // Step 4c — Mark agent code as used
      await authRepository.updateAgentCode(agentCodeRecord.id, authUser.id);

      // Step 4d — Sign in to obtain session token
      let token: string | null;
      try {
        const signInResult = await authRepository.signInWithPassword(
          params.email,
          params.password,
        );
        token = signInResult ? signInResult.token : null;
      } catch (error) {
        loggingService.error(
          'AuthService.register — sign-in after registration failed',
          error,
          { email: params.email },
        );
        token = null;
      }

      emitRegistration(tenant.id);
      return { user, token };
    } catch (error) {
      // Re-throw domain errors directly so the controller can handle them
      if (
        error instanceof TenantNotFoundError ||
        error instanceof AgentCodeInvalidError
      ) {
        throw error;
      }
      return handleServiceError('AuthService.register', error);
    }
    });
  }

  async me(userId: string): Promise<IUser | null> {
    try {
      const user = await authRepository.findUserById(userId);
      return user;
    } catch (error) {
      return handleServiceError('AuthService.me', error);
    }
  }

  async logout(token: string): Promise<void> {
    try {
      await authRepository.signOut(token);
    } catch (error) {
      return handleServiceError('AuthService.logout', error);
    }
  }

  async login(params: ILoginParams): Promise<ILoginResult> {
    return withServiceSpan('AuthService', 'login', { tenant_slug: params.tenantSlug }, async () => {
    try {
      // Step 1 — Resolve tenant
      const tenant = await authRepository.findTenantBySlug(params.tenantSlug);
      if (!tenant) {
        throw new TenantNotFoundError();
      }

      // Step 2 — Sign in with Supabase Auth
      const signInResult = await authRepository.signInWithPassword(
        params.email,
        params.password,
      );
      if (!signInResult) {
        emitLogin(tenant.id, false);
        throw new InvalidCredentialsError();
      }

      // Step 3 — Fetch user profile
      const user = await authRepository.findUserById(signInResult.userId);
      if (!user) {
        emitLogin(tenant.id, false);
        throw new InvalidCredentialsError();
      }

      // Step 4 — Verify tenant membership
      if (user.tenant_id !== tenant.id) {
        emitLogin(tenant.id, false);
        throw new InvalidCredentialsError();
      }

      emitLogin(tenant.id, true);
      return { user, token: signInResult.token };
    } catch (error) {
      // Re-throw domain errors directly so the controller can handle them
      if (
        error instanceof TenantNotFoundError ||
        error instanceof InvalidCredentialsError
      ) {
        throw error;
      }
      return handleServiceError('AuthService.login', error);
    }
    });
  }

  async forgotPassword(params: IForgotPasswordParams): Promise<void> {
    try {
      const tenant = await authRepository.findTenantBySlug(params.tenantSlug);
      if (!tenant) {
        throw new TenantNotFoundError();
      }

      const user = await authRepository.findUserByEmail(params.email, tenant.id);
      if (!user) {
        // Silently return — do not reveal whether the email exists
        return;
      }

      await authRepository.resetPasswordForEmail(
        params.email,
        EnvVars.FrontendResetPasswordUrl,
      );
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        throw error;
      }
      return handleServiceError('AuthService.forgotPassword', error);
    }
  }

  async resetPassword(params: IResetPasswordParams): Promise<void> {
    try {
      const { userId } = await authRepository.getUserIdFromToken(params.token);

      await authRepository.updateAuthUserPassword(userId, params.newPassword);
    } catch (error) {
      return handleServiceError('AuthService.resetPassword', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const authService = new AuthService();
export default authService;
