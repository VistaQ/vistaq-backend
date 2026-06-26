import { NextFunction, Response } from 'express';

import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import tenantLabelService from '@src/services/tenantLabel.service';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

export interface IGetLabelsRes extends IBaseRes {
  success: boolean;
  data: Record<string, string>;
}

/******************************************************************************
                            TenantLabelController
******************************************************************************/

class TenantLabelController {
  async getAll(
    req: IBaseReq,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const token = req.headers['authorization']!.slice(7);

      const data = await tenantLabelService.getLabels({
        tenantId: req.user!.tenant_id,
        token,
      });

      const responseBody: IGetLabelsRes = {
        success: true,
        data,
      };

      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('TenantLabelController.getAll', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const tenantLabelController = new TenantLabelController();
export default tenantLabelController;
