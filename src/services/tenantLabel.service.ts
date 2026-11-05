import { DEFAULT_LABELS } from '@src/constants/defaultLabels';
import tenantLabelRepository from '@src/repositories/tenantLabel.repository';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                            TenantLabelService
******************************************************************************/

class TenantLabelService {
  async getLabels(): Promise<Record<string, string>> {
    try {
      const rows = await tenantLabelRepository.findAll();

      const merged: Record<string, string> = { ...DEFAULT_LABELS };
      for (const row of rows) {
        merged[row.key] = row.value;
      }

      return merged;
    } catch (error) {
      return handleServiceError('TenantLabelService.getLabels', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

export const tenantLabelService = new TenantLabelService();
export default tenantLabelService;
