import { RouteError } from '@src/models/errors/route.error';
import pointConfigRepository from '@src/repositories/pointConfig.repository';
import pointActivityTypeService from '@src/services/pointActivityType.service';
import type { IPointConfig } from '@src/types/pointConfig.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface IPointConfigParams {
  activity: string;
  points: number;
}

/******************************************************************************
                            PointConfigService
******************************************************************************/

class PointConfigService {
  async createPointConfig(params: IPointConfigParams): Promise<IPointConfig> {
    try {
      const activityType = await pointActivityTypeService.getActivityType(
        params.activity,
      );
      if (!activityType) {
        throw new RouteError(
          HttpStatusCodes.BAD_REQUEST,
          'Invalid activity type.',
        );
      }

      const pointConfig = await pointConfigRepository.insertPointConfig({
        activity: params.activity,
        category: activityType.category,
        points: params.points,
      });
      if (!pointConfig) {
        throw new RouteError(
          HttpStatusCodes.BAD_REQUEST,
          'Config already exists for this activity.',
        );
      }
      return pointConfig;
    } catch (error) {
      if (error instanceof RouteError) throw error;
      return handleServiceError('PointConfigService.createPointConfig', error);
    }
  }

  async getPointConfigs(): Promise<IPointConfig[]> {
    try {
      return await pointConfigRepository.findAll();
    } catch (error) {
      return handleServiceError('PointConfigService.getPointConfigs', error);
    }
  }

  async updatePointConfig(params: IPointConfigParams): Promise<IPointConfig> {
    try {
      const updated = await pointConfigRepository.updatePoints(
        params.activity,
        params.points,
      );
      if (!updated) {
        throw new RouteError(
          HttpStatusCodes.NOT_FOUND,
          'Point config not found.',
        );
      }
      return updated;
    } catch (error) {
      if (error instanceof RouteError) throw error;
      return handleServiceError('PointConfigService.updatePointConfig', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const pointConfigService = new PointConfigService();
export default pointConfigService;
