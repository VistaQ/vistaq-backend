import { NextFunction, Response } from 'express';

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
}

/******************************************************************************
                                Export
******************************************************************************/

export const agentCodeController = new AgentCodeController();
export default agentCodeController;
