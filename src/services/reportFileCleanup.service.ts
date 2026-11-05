import reportJobRepository from '@src/repositories/reportJob.repository';
import supabaseService from '@src/services/supabase.service';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                          ReportFileCleanupService

  Removes raw xlsx files in the `reports-raw` bucket that belong to completed
  `report_jobs` older than the retention window (default 30 days). Replaces
  the SQL-driven pg_cron approach which only deleted `storage.objects` rows
  and orphaned the underlying file bytes.

  Flow:
    1. Repo query: completed jobs older than the cutoff that still have
       a non-empty `storage_path`.
    2. Chunked HTTP `remove()` calls through `supabaseService.removeFromStorage`
       (the only path that actually deletes the file backend bytes).
    3. On each successful chunk, blank `report_jobs.storage_path` so the same
       files are not re-queued on subsequent runs.

  Failure mode: a chunk that throws is logged and counted, the loop continues.
  The caller receives totals (`deletedCount`, `failedCount`) for telemetry.
******************************************************************************/

const REPORTS_BUCKET = 'reports-raw';
const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Supabase Storage's `remove()` accepts up to 1000 keys per request; we
// use a smaller chunk to keep error blast radius modest.
const REMOVE_CHUNK_SIZE = 100;

export interface ICleanupResult {
  deletedCount: number;
  failedCount: number;
}

class ReportFileCleanupService {
  /**
   * Deletes the raw xlsx files attached to completed report jobs older
   * than `RETENTION_DAYS` and clears their `storage_path` on success.
   *
   * Always returns a result — never throws on per-chunk failures so the
   * scheduler can retry naturally on the next tick. Programming-level
   * errors (e.g. repo query failure) are wrapped via `handleServiceError`.
   */
  async cleanupOldReportFiles(): Promise<ICleanupResult> {
    try {
      const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY)
        .toISOString();


      const candidates = await reportJobRepository.findCompletedJobsOlderThan(
        cutoff,
      );

      if (candidates.length === 0) {
        return { deletedCount: 0, failedCount: 0 };
      }

      let deletedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < candidates.length; i += REMOVE_CHUNK_SIZE) {
        const chunk = candidates.slice(i, i + REMOVE_CHUNK_SIZE);
        const paths = chunk.map((c) => c.storage_path);
        const references = chunk.map((c) => c.reference);

        try {
          const response = await supabaseService.removeFromStorage(
            REPORTS_BUCKET,
            paths,
          );
          if (response.error) {
            throw new Error(response.error.message);
          }
          await reportJobRepository.clearStoragePaths(references);
          deletedCount += chunk.length;
        } catch {
          failedCount += chunk.length;
        }
      }

      return { deletedCount, failedCount };
    } catch (error) {
      return handleServiceError(
        'ReportFileCleanupService.cleanupOldReportFiles',
        error,
      );
    }
  }
}

export const reportFileCleanupService = new ReportFileCleanupService();
export default reportFileCleanupService;
