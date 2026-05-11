import { NextFunction, Response } from 'express';
import { z } from 'zod';

import { AgentCodeConflictError, AgentCodeInUseError, AgentCodeNotFoundError } from '@src/models/errors/agentCode.errors';
import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import agentCodeService from '@src/services/agentCode.service';
import { IAgentCode } from '@src/types/agentCode';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface ICreateAgentCodesReq extends IBaseReq {
  body: {
    agentCodes: string[];
  };
}

interface IAgentCodeResponse {
  agentCode: string;
  isUsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ICreateAgentCodesRes extends IBaseRes {
  success: boolean;
  data: IAgentCodeResponse[];
}

export interface IAgentCodeListItem {
  agentCode: string;
  isUsed: boolean;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IListAgentCodesRes extends IBaseRes {
  success: boolean;
  data: IAgentCodeListItem[];
}

export interface IUpdateAgentCodeRes extends IBaseRes {
  success: boolean;
  data: IAgentCodeListItem;
}

const listAgentCodesQuerySchema = z.object({
  isUsed: z.enum(['true', 'false']).optional(),
});

/******************************************************************************
                            AgentCodeController
******************************************************************************/

class AgentCodeController {
  async createMany(
    req: ICreateAgentCodesReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const { agentCodes } = req.body;

      const result = await agentCodeService.createMany({
        agentCodes,
        tenantId: req.user!.tenant_id,
        token,
      });

      const responseBody: ICreateAgentCodesRes = {
        success: true,
        data: result.map((row: IAgentCode) => ({
          agentCode: row.agent_code,
          isUsed: row.is_used,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError(
        'AgentCodeController.createMany',
        error,
        next,
      );
    }
  }

  async list(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const parsed = listAgentCodesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          message: 'Validation failed',
          errors: parsed.error.issues,
        });
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const isUsed =
        parsed.data.isUsed !== undefined
          ? parsed.data.isUsed === 'true'
          : undefined;

      const result = await agentCodeService.list({ isUsed, token });

      const responseBody: IListAgentCodesRes = {
        success: true,
        data: result.map((row: IAgentCode) => ({
          agentCode: row.agent_code,
          isUsed: row.is_used,
          userId: row.user_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('AgentCodeController.list', error, next);
    }
  }

  async update(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const token = req.headers['authorization']!.slice(7);
      const currentAgentCode = req.params['agentCode'] as string;
      const { agentCode: newAgentCode } = req.body;

      const updated = await agentCodeService.update({
        currentAgentCode,
        newAgentCode,
        tenantId: req.user!.tenant_id,
        token,
      });

      const responseBody: IUpdateAgentCodeRes = {
        success: true,
        data: {
          agentCode: updated.agent_code,
          isUsed: updated.is_used,
          userId: updated.user_id,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      if (error instanceof AgentCodeNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof AgentCodeConflictError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('AgentCodeController.update', error, next);
    }
  }

  async remove(req: IBaseReq, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user!.role !== 'admin') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }
      const token = req.headers['authorization']!.slice(7);
      const agentCode = req.params['agentCode'] as string;
      await agentCodeService.remove({ agentCode, tenantId: req.user!.tenant_id, token });
      res.status(HttpStatusCodes.OK).json({ success: true });
    } catch (error) {
      if (error instanceof AgentCodeNotFoundError) {
        next(new RouteError(HttpStatusCodes.NOT_FOUND, error.message));
        return;
      }
      if (error instanceof AgentCodeInUseError) {
        next(new RouteError(HttpStatusCodes.CONFLICT, error.message));
        return;
      }
      return handleControllerError('AgentCodeController.remove', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeController = new AgentCodeController();
export default agentCodeController;
