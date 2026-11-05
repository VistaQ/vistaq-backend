import { DynamoTable } from '@src/services/dynamo.service';
import type { IUserStats } from '@src/types/userStats.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

interface IUserStatsItem {
  user_id: string;
  ym: number;
  prospects?: number;
  appointments_set?: number;
  appt_done?: number;
  stage_sales?: number;
  sales_noc?: number;
  sales_ace?: number;
}

const userStats = new DynamoTable<IUserStatsItem>('UserStats');

function toUserStats(item: IUserStatsItem): IUserStats {
  return {
    user_id: item.user_id,
    ym: item.ym,
    prospects: item.prospects ?? 0,
    appointments_set: item.appointments_set ?? 0,
    appt_done: item.appt_done ?? 0,
    stage_sales: item.stage_sales ?? 0,
    sales_noc: item.sales_noc ?? 0,
    sales_ace: item.sales_ace ?? 0,
  };
}

/******************************************************************************
                            UserStatsRepository
******************************************************************************/

class UserStatsRepository {
  /** Every month bucket from `fromYm` on, for each user; the lifetime row (ym 0) is never included. */
  async findSince(userIds: string[], fromYm: number): Promise<IUserStats[]> {
    try {
      const pages = await Promise.all(
        Array.from(new Set(userIds)).map((userId) =>
          userStats.queryAll({
            keyCondition: 'user_id = :user AND ym >= :from',
            values: { ':user': userId, ':from': fromYm },
          }),
        ),
      );
      return pages.flat().map(toUserStats);
    } catch (error) {
      return handleRepositoryError('UserStatsRepository.findSince', error);
    }
  }

  async findByMonths(yms: number[]): Promise<IUserStats[]> {
    try {
      const pages = await Promise.all(
        Array.from(new Set(yms)).map((ym) =>
          userStats.queryAll({
            index: 'byMonth',
            keyCondition: 'ym = :ym',
            values: { ':ym': ym },
          }),
        ),
      );
      return pages.flat().map(toUserStats);
    } catch (error) {
      return handleRepositoryError('UserStatsRepository.findByMonths', error);
    }
  }
}

export const userStatsRepository = new UserStatsRepository();
export default userStatsRepository;
