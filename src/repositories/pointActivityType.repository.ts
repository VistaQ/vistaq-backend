import { DynamoTable } from '@src/services/dynamo.service';
import type { IPointActivityType } from '@src/types/pointActivityType.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

interface IPointActivityTypeItem {
  name: string;
  category: string;
  label: string;
  subject_type: string;
}

const activityTypes = new DynamoTable<IPointActivityTypeItem>(
  'PointActivityTypes',
);

function toActivityType(item: IPointActivityTypeItem): IPointActivityType {
  return {
    name: item.name,
    category: item.category,
    label: item.label,
    subject_type: item.subject_type,
  };
}

/******************************************************************************
                        PointActivityTypeRepository
******************************************************************************/

class PointActivityTypeRepository {
  async findAll(): Promise<IPointActivityType[]> {
    try {
      return (await activityTypes.scanAll()).map(toActivityType);
    } catch (error) {
      return handleRepositoryError(
        'PointActivityTypeRepository.findAll',
        error,
      );
    }
  }

  async findByName(name: string): Promise<IPointActivityType | null> {
    try {
      const item = await activityTypes.get({ name });
      return item ? toActivityType(item) : null;
    } catch (error) {
      return handleRepositoryError(
        'PointActivityTypeRepository.findByName',
        error,
      );
    }
  }
}

const pointActivityTypeRepository = new PointActivityTypeRepository();
export default pointActivityTypeRepository;
