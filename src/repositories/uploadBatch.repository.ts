import supabaseService from '@src/services/supabase.service';
import { Database } from '@src/types/database.types';
import {
  IPaginatedUploadAudit,
  IUploadAuditEntry,
  IUploadBatch,
  UploadBatchIns,
  UploadBatchRow,
  UploadStatus,
} from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

type UsersRow = Database['public']['Tables']['users']['Row'];

interface BatchSummaryUpdate {
  rows_loaded: number;
  rows_skipped: number;
  status: UploadStatus;
}

interface BatchAuditRow {
  id: string;
  year: number;
  month: number;
  file_name: string;
  rows_loaded: number;
  rows_skipped: number;
  status: string;
  created_at: string;
  uploaded_by: string | null;
}

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
      rows_skipped: row.rows_skipped,
      status: row.status as UploadStatus,
      created_at: row.created_at,
    };
  }

  /**
   * Returns the IDs of every `upload_batches` row for the given tenant + year
   * + month, EXCLUDING the supplied `excludeBatchId`. Used by the sales-points
   * reversal step to find prior batches whose point_transactions need offset
   * entries when a month is re-uploaded for corrections.
   */
  async findPriorBatchIdsForPeriod(
    tenantId: string,
    year: number,
    month: number,
    excludeBatchId: string,
  ): Promise<string[]> {
    try {
      // Fetch all matching ids for the period and filter out the excluded
      // current batch in JS — the wrapper exposes `.eq()` filters, and the
      // exclusion is a single id-equality check that doesn't justify adding a
      // dedicated `.neq()` primitive.
      const { data, error } = await supabaseService.adminSelect(
        'upload_batches',
        'id',
        { tenant_id: tenantId, year, month } as Partial<UploadBatchRow>,
      );
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as { id: string }[];
      return rows.map((r) => r.id).filter((id) => id !== excludeBatchId);
    } catch (error) {
      handleRepositoryError(
        'UploadBatchRepository.findPriorBatchIdsForPeriod',
        error,
      );
    }
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

  async updateBatchSummary(
    batchId: string,
    summary: BatchSummaryUpdate,
  ): Promise<void> {
    try {
      const response = await supabaseService.adminUpdate(
        'upload_batches',
        {
          rows_loaded: summary.rows_loaded,
          rows_skipped: summary.rows_skipped,
          status: summary.status,
        },
        { id: batchId },
      );
      if (response.error) {
        throw new Error(response.error.message);
      }
    } catch (error) {
      handleRepositoryError('UploadBatchRepository.updateBatchSummary', error);
    }
  }

  /**
   * Paginated audit list of upload batches for a tenant + year.
   *
   * Sorted by `created_at` DESC. The uploader's display name is resolved via a
   * second query against `public.users`; we cannot use a PostgREST embedded
   * select because `upload_batches.uploaded_by` FKs into `auth.users`, not the
   * public users table that holds `name`. Manual-mode uploads (uploaded_by IS
   * NULL) carry `uploader_name = null`.
   */
  async findPaginatedAuditByTenant(
    tenantId: string,
    year: number,
    page: number,
    pageSize: number,
  ): Promise<IPaginatedUploadAudit> {
    try {
      const offset = (page - 1) * pageSize;
      const rangeEnd = offset + pageSize - 1;

      const { data, error, count } = await supabaseService.adminSelectPaginated(
        'upload_batches',
        'id, year, month, file_name, rows_loaded, rows_skipped, status, created_at, uploaded_by',
        { tenant_id: tenantId, year } as Partial<UploadBatchRow>,
        { column: 'created_at', ascending: false },
        { from: offset, to: rangeEnd },
      );

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as unknown as BatchAuditRow[];
      const uploaderIds = Array.from(
        new Set(
          rows
            .map((r) => r.uploaded_by)
            .filter((id): id is string => id !== null),
        ),
      );

      const nameByUserId = new Map<string, string>();
      if (uploaderIds.length > 0) {
        const { data: userRows, error: userError } =
          await supabaseService.adminSelectIn(
            'users',
            'id, name',
            'id',
            uploaderIds,
          );

        if (userError) throw new Error(userError.message);
        const users = (userRows ?? []) as unknown as Pick<UsersRow, 'id' | 'name'>[];
        for (const u of users) {
          nameByUserId.set(u.id, u.name);
        }
      }

      const entries: IUploadAuditEntry[] = rows.map((r) => ({
        id: r.id,
        year: r.year,
        month: r.month,
        file_name: r.file_name,
        rows_loaded: r.rows_loaded,
        rows_skipped: r.rows_skipped,
        status: r.status as UploadStatus,
        uploader_name:
          r.uploaded_by !== null ? nameByUserId.get(r.uploaded_by) ?? null : null,
        imported_at: r.created_at,
      }));

      return {
        data: entries,
        meta: { page, pageSize, total: count ?? 0 },
      };
    } catch (error) {
      handleRepositoryError(
        'UploadBatchRepository.findPaginatedAuditByTenant',
        error,
      );
    }
  }
}

export const uploadBatchRepository = new UploadBatchRepository();
export default uploadBatchRepository;
