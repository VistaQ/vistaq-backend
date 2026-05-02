import supabaseService from '@src/services/supabase.service';
import { IUploadBatch, UploadBatchIns, UploadBatchRow } from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

class UploadBatchRepository {
  private mapRow(row: UploadBatchRow): IUploadBatch {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      uploaded_by: row.uploaded_by,
      year: row.year,
      month: row.month,
      file_name: row.file_name,
      rows_loaded: row.rows_loaded,
      created_at: row.created_at,
    };
  }

  async insertBatch(data: UploadBatchIns): Promise<IUploadBatch> {
    try {
      const response = await supabaseService.adminInsert('upload_batches', data);
      if (response.error || !response.data?.[0]) {
        throw new Error(response.error?.message ?? 'No row returned from insert');
      }
      return this.mapRow(response.data[0] as UploadBatchRow);
    } catch (error) {
      handleRepositoryError('UploadBatchRepository.insertBatch', error);
    }
  }

  async updateRowsLoaded(batchId: string, rowsLoaded: number): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'upload_batches',
        { rows_loaded: rowsLoaded },
        { id: batchId },
      );
      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      handleRepositoryError('UploadBatchRepository.updateRowsLoaded', error);
    }
  }
}

export const uploadBatchRepository = new UploadBatchRepository();
export default uploadBatchRepository;
