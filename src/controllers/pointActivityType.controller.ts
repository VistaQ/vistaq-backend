import { NextFunction, Response } from 'express';

import { IBaseReq, IBaseRes } from '@src/models/interfaces/base.interface';
import pointActivityTypeService from '@src/services/pointActivityType.service';
import { IPointActivityType } from '@src/types/pointActivityType.types';
import { handleControllerError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IGetPointActivityTypesRes extends IBaseRes {
  success: boolean;
  data: IPointActivityType[];
}

/******************************************************************************
                        PointActivityTypeController
******************************************************************************/

class PointActivityTypeController {
  async getAll(req: IBaseReq, res: Response, next: NextFunction): Promise<void> {
    try {
      const activityTypes = await pointActivityTypeService.getAllActivityTypes();
      const responseBody: IGetPointActivityTypesRes = { success: true, data: activityTypes };
      res.status(HttpStatusCodes.OK).json(responseBody);
    } catch (error) {
      return handleControllerError('PointActivityTypeController.getAll', error, next);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

const pointActivityTypeController = new PointActivityTypeController();
export default pointActivityTypeController;
