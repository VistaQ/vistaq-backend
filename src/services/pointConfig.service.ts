import { RouteError } from '@src/models/errors/route.error';
import pointConfigRepository from '@src/repositories/pointConfig.repository';
import { IPointConfig } from '@src/types/pointConfig.types';
import { handleServiceError } from '@src/utils/errorHandlers';
import HttpStatusCodes from '@src/utils/HttpStatusCodes';

/******************************************************************************
                            Interfaces
******************************************************************************/

interface ICreatePointConfigParams {
  activity: string;
  points: number;
  tenantId: string;
  token: string;
}

interface IUpdatePointConfigParams {
  activity: string;
  points: number;
  tenantId: string;
  token: string;
}

/******************************************************************************
                            PointConfigService
******************************************************************************/

class PointConfigService {
  async createPointConfig(params: ICreatePointConfigParams): Promise<IPointConfig> {
    try {
      const existing = await pointConfigRepository.findByTenantAndActivity(
        params.tenantId,
        params.activity,
        params.token,
      );

      if (existing) {
        throw new RouteError(
          HttpStatusCodes.BAD_REQUEST,
          'Config already exists for this activity.',
        );
      }

      const pointConfig = await pointConfigRepository.insertPointConfig(
        {
          tenant_id: params.tenantId,
          activity: params.activity,
          points: params.points,
        },
        params.token,
      );

      return pointConfig;
    } catch (error) {
      if (error instanceof RouteError) throw error;
      return handleServiceError('PointConfigService.createPointConfig', error);
    }
  }

  async getPointConfigs(tenantId: string, token: string): Promise<IPointConfig[]> {
    try {
      const configs = await pointConfigRepository.findByTenantId(tenantId, token);
      return configs;
    } catch (error) {
      return handleServiceError('PointConfigService.getPointConfigs', error);
    }
  }

  async updatePointConfig(params: IUpdatePointConfigParams): Promise<IPointConfig> {
    try {
      const existing = await pointConfigRepository.findByTenantAndActivity(
        params.tenantId,
        params.activity,
        params.token,
      );

      if (!existing) {
        throw new RouteError(
          HttpStatusCodes.NOT_FOUND,
          'Point config not found.',
        );
      }

      const updated = await pointConfigRepository.updatePointConfig(
        params.tenantId,
        params.activity,
        { points: params.points, updated_at: new Date().toISOString() },
        params.token,
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
