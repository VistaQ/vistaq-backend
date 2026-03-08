import { NextFunction, Response } from 'express';

import { AgentCodeInvalidError } from '@src/models/errors/auth.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import loggingService from '@src/services/logging.service';
import userService from '@src/services/user.service';
import { IUser } from '@src/types/auth.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateUserReq extends IBaseReq {
  body: {
    email: string;
    name: string;
    password: string;
    role: string;
    agentCode?: string;
  };
}

export interface ICreateUserRes extends IBaseRes {
  success: boolean;
  data: IUser;
}

/******************************************************************************
                            UserController
******************************************************************************/

class UserController {
  async create(
    req: ICreateUserReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      loggingService.info('UserController.create called');

      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { email, name, password, role, agentCode } = req.body;

      const user = await userService.createUser({
        email,
        name,
        password,
        role,
        agentCode,
        tenantId: req.user!.tenant_id,
        token,
      });

      const responseBody: ICreateUserRes = {
        success: true,
        data: user,
      };

      res.status(HttpStatusCodes.CREATED).json(responseBody);
    } catch (error) {
      if (error instanceof AgentCodeInvalidError) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, error.message));
        return;
      }

      return handleControllerError('UserController.create', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const userController = new UserController();
export default userController;
