import pointActivityTypeRepository from '@src/repositories/pointActivityType.repository';
import { IPointActivityType } from '@src/types/pointActivityType.types';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                        PointActivityTypeService
******************************************************************************/

class PointActivityTypeService {
  async getAllActivityTypes(): Promise<IPointActivityType[]> {
    try {
      return await pointActivityTypeRepository.findAll();
    } catch (error) {
      return handleServiceError('PointActivityTypeService.getAllActivityTypes', error);
    }
  }

  async getActivityType(name: string): Promise<IPointActivityType | null> {
    try {
      return await pointActivityTypeRepository.findByName(name);
    } catch (error) {
      return handleServiceError('PointActivityTypeService.getActivityType', error);
    }
  }
}

/******************************************************************************
                                Export
******************************************************************************/

const pointActivityTypeService = new PointActivityTypeService();
export default pointActivityTypeService;
