import { randomUUID } from 'crypto';

import { TRANSITIONAL_TENANT_ID } from '@src/constants/tenant';
import { DynamoConditionFailedError } from '@src/models/errors/dynamo.error';
import { DynamoTable } from '@src/services/dynamo.service';
import type { IPointConfig } from '@src/types/pointConfig.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';
import { nowUtc } from '@src/utils/period';

interface IPointConfigItem {
  id: string;
  activity: string;
  category: string;
  points: number;
  created_at: string;
  updated_at: string;
}

const pointConfigs = new DynamoTable<IPointConfigItem>('PointConfigs');

function toPointConfig(item: IPointConfigItem): IPointConfig {
  return {
    id: item.id,
    activity: item.activity,
    category: item.category,
    points: item.points,
    tenant_id: TRANSITIONAL_TENANT_ID,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/******************************************************************************
                            PointConfigRepository
******************************************************************************/

class PointConfigRepository {
  /** Returns null when the activity already has a config. */
  async insertPointConfig(data: {
    activity: string;
    category: string;
    points: number;
  }): Promise<IPointConfig | null> {
    try {
      const now = nowUtc();
      const item: IPointConfigItem = {
        id: randomUUID(),
        ...data,
        created_at: now,
        updated_at: now,
      };
      await pointConfigs.put(item, {
        condition: 'attribute_not_exists(activity)',
      });
      return toPointConfig(item);
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) return null;
      return handleRepositoryError(
        'PointConfigRepository.insertPointConfig',
        error,
      );
    }
  }

  async findAll(): Promise<IPointConfig[]> {
    try {
      return (await pointConfigs.scanAll()).map(toPointConfig);
    } catch (error) {
      return handleRepositoryError('PointConfigRepository.findAll', error);
    }
  }

  async findByCategory(category: string): Promise<IPointConfig[]> {
    try {
      const items = await pointConfigs.queryAll({
        index: 'byCategory',
        keyCondition: 'category = :category',
        values: { ':category': category },
      });
      return items.map(toPointConfig);
    } catch (error) {
      return handleRepositoryError(
        'PointConfigRepository.findByCategory',
        error,
      );
    }
  }

  async findByActivity(activity: string): Promise<IPointConfig | null> {
    try {
      const item = await pointConfigs.get({ activity }, { consistent: true });
      return item ? toPointConfig(item) : null;
    } catch (error) {
      return handleRepositoryError(
        'PointConfigRepository.findByActivity',
        error,
      );
    }
  }

  async updatePoints(
    activity: string,
    points: number,
  ): Promise<IPointConfig | null> {
    try {
      const updated = await pointConfigs.updateFields(
        { activity },
        { points },
        { condition: 'attribute_exists(activity)' },
      );
      return updated ? toPointConfig(updated) : null;
    } catch (error) {
      if (error instanceof DynamoConditionFailedError) return null;
      return handleRepositoryError('PointConfigRepository.updatePoints', error);
    }
  }
}

export const pointConfigRepository = new PointConfigRepository();
export default pointConfigRepository;
