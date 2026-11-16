import { DynamoTable } from '@src/services/dynamo.service';
import type { ITenantLabel } from '@src/types/tenantLabel.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

interface ILabelItem {
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

const labels = new DynamoTable<ILabelItem>('Labels');

/******************************************************************************
                            TenantLabelRepository
******************************************************************************/

class TenantLabelRepository {
  async findAll(): Promise<ITenantLabel[]> {
    try {
      const items = await labels.scanAll();
      return items.map((item) => ({
        id: item.key,
        key: item.key,
        value: item.value,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
    } catch (error) {
      return handleRepositoryError('TenantLabelRepository.findAll', error);
    }
  }
}

export const tenantLabelRepository = new TenantLabelRepository();
export default tenantLabelRepository;
