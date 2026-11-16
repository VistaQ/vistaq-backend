import { DynamoTable } from '@src/services/dynamo.service';
import type { PointCategory } from '@src/types/agentPoints.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

export interface IPointTotals {
  user_id: string;
  ym: number;
  points: number;
  txn_count: number;
  categories: Record<PointCategory, number>;
}

export interface IPointTotalsItem {
  user_id: string;
  ym: number;
  points?: number;
  txn_count?: number;
  prospect_points?: number;
  sales_points?: number;
  coaching_points?: number;
}

/** ym 0 is the lifetime row. */
export const LIFETIME_YM = 0;

const pointTotals = new DynamoTable<IPointTotalsItem>('PointTotals');

function toTotals(item: IPointTotalsItem): IPointTotals {
  return {
    user_id: item.user_id,
    ym: item.ym,
    points: item.points ?? 0,
    txn_count: item.txn_count ?? 0,
    categories: {
      prospect: item.prospect_points ?? 0,
      sales: item.sales_points ?? 0,
      coaching: item.coaching_points ?? 0,
    },
  };
}

/******************************************************************************
                          PointTotalsRepository
******************************************************************************/

class PointTotalsRepository {
  async findOne(userId: string, ym: number): Promise<IPointTotals | null> {
    try {
      const item = await pointTotals.get({ user_id: userId, ym });
      return item ? toTotals(item) : null;
    } catch (error) {
      return handleRepositoryError('PointTotalsRepository.findOne', error);
    }
  }

  async findByMonths(yms: number[]): Promise<IPointTotals[]> {
    try {
      const pages = await Promise.all(
        Array.from(new Set(yms)).map((ym) =>
          pointTotals.queryAll({
            index: 'byMonth',
            keyCondition: 'ym = :ym',
            values: { ':ym': ym },
          }),
        ),
      );
      return pages.flat().map(toTotals);
    } catch (error) {
      return handleRepositoryError('PointTotalsRepository.findByMonths', error);
    }
  }
}

export const pointTotalsRepository = new PointTotalsRepository();
export default pointTotalsRepository;
