import type { NextFunction, Response } from 'express';

import {
  AgentCodeInvalidError,
  InvalidCredentialsError,
  UserAlreadyExistsError,
  UserInactiveError,
} from '@src/models/errors/auth.errors';
import { CognitoRateLimitedError } from '@src/models/errors/cognito.error';
import { RouteError } from '@src/models/errors/route.error';
import type { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import authService from '@src/services/auth.service';
import type { ITokens } from '@src/services/cognito.service';
import type { IUser } from '@src/types/auth.types';
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
    groupId: string;
    location: string;
  };
}

export interface IRegisterRes extends IBaseRes {
  success: boolean;
  data: { user: IUser };
}

export interface ILoginReq extends IBaseReq {
  body: { email: string };
}

export interface ILoginRes extends IBaseRes {
  success: boolean;
  data: { session: string };
}

export interface IVerifyLoginReq extends IBaseReq {
  body: { email: string; session: string; code: string };
}

export interface IVerifyLoginRes extends IBaseRes {
  success: boolean;
  data: { user: IUser; tokens: ITokens };
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
      const result = await authService.register(req.body);

      const responseBody: IRegisterRes = {
        success: true,
        data: { user: result.user },
      };
      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (error instanceof AgentCodeInvalidError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }
      if (error instanceof UserAlreadyExistsError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('AuthController.register', error, next);
    }
  }

  async login(
    req: ILoginReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await authService.login(req.body.email);

      const responseBody: ILoginRes = {
        success: true,
        data: { session: result.session },
      };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'Invalid credentials'));
        return;
      }
      if (error instanceof CognitoRateLimitedError) {
        next(new RouteError(HttpStatusCodes.TOO_MANY_REQUESTS, error.message));
        return;
      }
      return handleControllerError('AuthController.login', error, next);
    }
  }

  async verifyLogin(
    req: IVerifyLoginReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const result = await authService.verifyLogin(req.body);

      const responseBody: IVerifyLoginRes = {
        success: true,
        data: { user: result.user, tokens: result.tokens },
      };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'Invalid credentials'));
        return;
      }
      if (error instanceof UserInactiveError) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, error.message));
        return;
      }
      if (error instanceof CognitoRateLimitedError) {
        next(new RouteError(HttpStatusCodes.TOO_MANY_REQUESTS, error.message));
        return;
      }
      return handleControllerError('AuthController.verifyLogin', error, next);
    }
  }

  async logout(
    req: ILogoutReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers['authorization'];

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
      const user = await authService.me(req.user!.id);

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
}

/******************************************************************************
                                Export
******************************************************************************/

export const authController = new AuthController();
export default authController;
