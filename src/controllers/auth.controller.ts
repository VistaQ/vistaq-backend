import { NextFunction, Response } from 'express';

import {
  AgentCodeInvalidError,
  InvalidCredentialsError,
  TenantNotFoundError,
} from '@src/models/errors/auth.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import authService from '@src/services/auth.service';
import loggingService from '@src/services/logging.service';
import { IUser } from '@src/types/auth.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IRegisterReq extends IBaseReq {
  body: {
    fullName: string;
    agentCode: string;
    email: string;
    password: string;
    groupId: string;
    location: string;
  };
}

export interface IRegisterRes extends IBaseRes {
  success: boolean;
  data: {
    user: IUser;
    token: string | null;
  };
}

export interface ILoginReq extends IBaseReq {
  body: { email: string; password: string };
}

export interface ILoginRes extends IBaseRes {
  success: boolean;
  data: { user: IUser; token: string };
}

export interface ILogoutReq extends IBaseReq {
  body: Record<string, never>;
}

export interface ILogoutRes extends IBaseRes {
  success: boolean;
}

export type IMeReq = IBaseReq;

export interface IMeRes extends IBaseRes {
  success: boolean;
  data?: IUser;
}

export interface IForgotPasswordReq extends IBaseReq {
  body: { email: string };
}

export interface IForgotPasswordRes extends IBaseRes {
  success: boolean;
  message: string;
}

export interface IResetPasswordReq extends IBaseReq {
  body: { token: string; newPassword: string };
}

export interface IResetPasswordRes extends IBaseRes {
  success: boolean;
  message: string;
}

/******************************************************************************
                            AuthController
******************************************************************************/

class AuthController {
  async register(
    req: IRegisterReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('AuthController.register called');

      const tenantSlug = req.headers['x-tenant-slug'];

      if (!tenantSlug || typeof tenantSlug !== 'string') {
        loggingService.error(
          'AuthController.register — missing or invalid X-Tenant-Slug header',
        );
        next(
          new RouteError(
            HttpStatusCodes.BAD_REQUEST,
            'X-Tenant-Slug header is required',
          ),
        );
        return;
      }

      const { fullName, agentCode, email, password, groupId, location } =
        req.body;

      const result = await authService.register({
        tenantSlug,
        fullName,
        agentCode,
        email,
        password,
        groupId,
        location,
      });

      const responseBody: IRegisterRes = {
        success: true,
        data: {
          user: result.user,
          token: result.token,
        },
      };

      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      if (error instanceof AgentCodeInvalidError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }

      return handleControllerError('AuthController.register', error, next);
    }
  }

  async logout(
    req: ILogoutReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('AuthController.logout called');

      const authHeader = req.headers['authorization'];

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        loggingService.error(
          'AuthController.logout — missing or malformed Authorization header',
        );
        next(
          new RouteError(
            HttpStatusCodes.UNAUTHORIZED,
            'Authorization header is required',
          ),
        );
        return;
      }

      const token = authHeader.slice(7);

      if (!token) {
        loggingService.error(
          'AuthController.logout — missing token in Authorization header',
        );
        next(
          new RouteError(
            HttpStatusCodes.UNAUTHORIZED,
            'Authorization token is required',
          ),
        );
        return;
      }

      await authService.logout(token);

      const responseBody: ILogoutRes = { success: true };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('AuthController.logout', error, next);
    }
  }

  async me(req: IMeReq, res: Response, next: NextFunction): Promise<void> {
    try {
      loggingService.info('AuthController.me called');

      const userId: string = req.user!.id;
      const user = await authService.me(userId);

      if (!user) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'User not found'));
        return;
      }

      const responseBody: IMeRes = { success: true, data: user };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('AuthController.me', error, next);
    }
  }

  async login(
    req: ILoginReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('AuthController.login called');

      const tenantSlug = req.headers['x-tenant-slug'];

      if (!tenantSlug || typeof tenantSlug !== 'string') {
        loggingService.error(
          'AuthController.login — missing or invalid X-Tenant-Slug header',
        );
        next(
          new RouteError(
            HttpStatusCodes.BAD_REQUEST,
            'X-Tenant-Slug header is required',
          ),
        );
        return;
      }

      const { email, password } = req.body;

      const result = await authService.login({
        tenantSlug,
        email,
        password,
      });

      const responseBody: ILoginRes = {
        success: true,
        data: {
          user: result.user,
          token: result.token,
        },
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      if (error instanceof InvalidCredentialsError) {
        next(
          new RouteError(HttpStatusCodes.BAD_REQUEST, 'Invalid credentials'),
        );
        return;
      }

      return handleControllerError('AuthController.login', error, next);
    }
  }

  async forgotPassword(
    req: IForgotPasswordReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('AuthController.forgotPassword called');

      const tenantSlug = req.headers['x-tenant-slug'];

      if (!tenantSlug || typeof tenantSlug !== 'string') {
        loggingService.error(
          'AuthController.forgotPassword — missing or invalid X-Tenant-Slug header',
        );
        next(
          new RouteError(
            HttpStatusCodes.BAD_REQUEST,
            'X-Tenant-Slug header is required',
          ),
        );
        return;
      }

      const { email } = req.body;

      await authService.forgotPassword({ tenantSlug, email });

      const responseBody: IForgotPasswordRes = {
        success: true,
        message: 'Password reset email sent',
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof TenantNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      return handleControllerError('AuthController.forgotPassword', error, next);
    }
  }

  async resetPassword(
    req: IResetPasswordReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('AuthController.resetPassword called');

      const { token, newPassword } = req.body;

      await authService.resetPassword({ token, newPassword });

      const responseBody: IResetPasswordRes = {
        success: true,
        message: 'Password reset successful',
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('AuthController.resetPassword', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const authController = new AuthController();
export default authController;
