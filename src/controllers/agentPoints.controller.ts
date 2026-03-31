import { NextFunction, Response } from 'express';
import { z } from 'zod';

import { RouteError } from '@src/models/errors/route.error';
import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import agentPointsService from '@src/services/agentPoints.service';
import { IAgentPointsResponse } from '@src/types/agentPoints.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IGetAgentPointsRes extends IBaseRes {
  success: boolean;
  data: IAgentPointsResponse;
}

/******************************************************************************
                            Validation
******************************************************************************/

const querySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/******************************************************************************
                            AgentPointsController
******************************************************************************/

class AgentPointsController {
  async getAgentPoints(req: IBaseReq, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(HttpStatusCodes.BAD_REQUEST).json({
          message: 'Validation failed',
          errors: parsed.error.issues,
        });
        return;
      }

      const { userId, page, limit } = parsed.data;
      const requestingUserId = req.user!.id;
      const requestingRole = req.user!.role;
      const tenantId = req.user!.tenant_id;

      const targetUserId = userId ?? requestingUserId;

      if (targetUserId !== requestingUserId && requestingRole === 'agent') {
        next(new RouteError(HttpStatusCodes.FORBIDDEN, 'Forbidden'));
        return;
      }

      const data = await agentPointsService.getAgentPoints(tenantId, targetUserId, page, limit);

      const responseBody: IGetAgentPointsRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('AgentPointsController.getAgentPoints', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export default new AgentPointsController();
