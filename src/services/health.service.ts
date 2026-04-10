import { IHealthRes } from '@src/models/health/health.interface';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            HealthService
******************************************************************************/

class HealthService {
  /**
   * Returns the current health status of the API.
   * Maps to the IHealthRes interface before returning — never returns raw data.
   */
  check(): IHealthRes {
    try {
      const result: IHealthRes = {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };

      return result;
    } catch (error) {
      return handleServiceError('HealthService.check', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const healthService = new HealthService();
export default healthService;
