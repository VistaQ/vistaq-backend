import { NextFunction, Response } from 'express';

import {
  AgentCodeInvalidError,
  UserNotFoundError,
} from '@src/models/errors/auth.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import userService from '@src/services/user.service';
import { IUser, IUserWithManagedGroups } from '@src/types/auth.types';
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

export interface IGetUserByIdReq extends IBaseReq {
  params: {
    userId: string;
  };
}

export interface IGetUserByIdRes extends IBaseRes {
  success: boolean;
  data: IUserWithManagedGroups;
}

export interface IGetUsersRes extends IBaseRes {
  success: boolean;
  data: IUserWithManagedGroups[];
}

export interface IUpdateUserReq extends IBaseReq {
  params: {
    userId: string;
  };
  body: {
    email?: string;
    name?: string;
    phone?: string;
    agency?: string;
    location?: string;
    role?: string;
  };
}

export interface IUserStatusChangeReq extends IBaseReq {
  params: {
    userId: string;
  };
}

export interface IUpdateUserRes extends IBaseRes {
  success: boolean;
  data: IUser;
}

export interface ICreateUserRes extends IBaseRes {
  success: boolean;
  data: IUser;
}

export interface IDeleteUserReq extends IBaseReq {
  params: {
    userId: string;
  };
}

export interface IDeleteUserRes extends IBaseRes {
  success: boolean;
}

export interface IChangePasswordReq extends IBaseReq {
  body: {
    newPassword: string;
  };
}

export interface IChangePasswordRes extends IBaseRes {
  success: boolean;
  message: string;
}

/******************************************************************************
                            UserController
******************************************************************************/

class UserController {
  async getById(
    req: IGetUserByIdReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const { userId } = req.params;

      const user = await userService.getUserById(userId, token);

      if (user === null) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, 'User not found'));
        return;
      }

      const responseBody: IGetUserByIdRes = {
        success: true,
        data: user,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('UserController.getById', error, next);
    }
  }

  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);

      const users = await userService.getUsers(token);

      const responseBody: IGetUsersRes = {
        success: true,
        data: users,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('UserController.getAll', error, next);
    }
  }

  async update(
    req: IUpdateUserReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const { userId } = req.params;

      // Non-admin users can only update themselves
      if (req.user!.role !== 'admin' && req.user!.id !== userId) {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const user = await userService.updateUser({
        userId,
        callerRole: req.user!.role,
        token,
        data: req.body,
      });

      const responseBody: IUpdateUserRes = {
        success: true,
        data: user,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      return handleControllerError('UserController.update', error, next);
    }
  }

  async delete(
    req: IDeleteUserReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);
      const { userId } = req.params;

      await userService.deleteUser(userId, token);

      const responseBody: IDeleteUserRes = {
        success: true,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      return handleControllerError('UserController.delete', error, next);
    }
  }

  async changePassword(
    req: IChangePasswordReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const { newPassword } = req.body;

      await userService.changePassword(userId, newPassword);

      const responseBody: IChangePasswordRes = {
        success: true,
        message: 'Password changed successfully',
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('UserController.changePassword', error, next);
    }
  }

  async deactivate(
    req: IUserStatusChangeReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { userId } = req.params;

      if (req.user!.id === userId) {
        next(new RouteError(HttpStatusCodes.BAD_REQUEST, 'Admins cannot deactivate themselves'));
        return;
      }

      const user = await userService.setUserStatus(userId, 'inactive', token);

      const responseBody: IUpdateUserRes = {
        success: true,
        data: user,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      return handleControllerError('UserController.deactivate', error, next);
    }
  }

  async reactivate(
    req: IUserStatusChangeReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { userId } = req.params;

      const user = await userService.setUserStatus(userId, 'active', token);

      const responseBody: IUpdateUserRes = {
        success: true,
        data: user,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }

      return handleControllerError('UserController.reactivate', error, next);
    }
  }

  async create(
    req: ICreateUserReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
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
