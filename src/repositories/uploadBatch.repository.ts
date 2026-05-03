import supabaseService from '@src/services/supabase.service';
import {
  IPaginatedUploadAudit,
  IUploadAuditEntry,
  IUploadBatch,
  UploadBatchIns,
  UploadBatchRow,
  UploadStatus,
} from '@src/types/salesReport.types';
import { handleRepositoryError } from '@src/utils/errorHandlers';

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
      const { data, error } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => {
                    eq: (c: string, v: unknown) => {
                      neq: (c: string, v: unknown) => Promise<{
                        data: { id: string }[] | null;
                        error: { message: string } | null;
                      }>;
                    };
                  };
                };
              };
            };
          };
        }
      ).adminClient
        .from('upload_batches')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('year', year)
        .eq('month', month)
        .neq('id', excludeBatchId);

      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => r.id);
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

      // Direct adminClient call: the wrapper's `adminSelect` doesn't expose
      // `range` or `count: 'exact'`.
      const { data, error, count } = await (
        supabaseService as unknown as {
          adminClient: {
            from: (t: string) => {
              select: (s: string, opts: { count: 'exact' }) => {
                eq: (c: string, v: unknown) => {
                  eq: (c: string, v: unknown) => {
                    order: (c: string, opts: { ascending: boolean }) => {
                      range: (
                        from: number,
                        to: number,
                      ) => Promise<{
                        data: BatchAuditRow[] | null;
                        error: { message: string } | null;
                        count: number | null;
                      }>;
                    };
                  };
                };
              };
            };
          };
        }
      ).adminClient
        .from('upload_batches')
        .select(
          'id, year, month, file_name, rows_loaded, rows_skipped, status, created_at, uploaded_by',
          { count: 'exact' },
        )
        .eq('tenant_id', tenantId)
        .eq('year', year)
        .order('created_at', { ascending: false })
        .range(offset, rangeEnd);

      if (error) throw new Error(error.message);

      const rows = data ?? [];
      const uploaderIds = Array.from(
        new Set(
          rows
            .map((r) => r.uploaded_by)
            .filter((id): id is string => id !== null),
        ),
      );

      const nameByUserId = new Map<string, string>();
      if (uploaderIds.length > 0) {
        const { data: userRows, error: userError } = await (
          supabaseService as unknown as {
            adminClient: {
              from: (t: string) => {
                select: (s: string) => {
                  in: (
                    c: string,
                    v: unknown[],
                  ) => Promise<{
                    data: { id: string; name: string }[] | null;
                    error: { message: string } | null;
                  }>;
                };
              };
            };
          }
        ).adminClient
          .from('users')
          .select('id, name')
          .in('id', uploaderIds);

        if (userError) throw new Error(userError.message);
        for (const u of userRows ?? []) {
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
