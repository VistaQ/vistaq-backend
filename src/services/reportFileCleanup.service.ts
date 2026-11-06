import reportJobRepository from '@src/repositories/reportJob.repository';
import storageService from '@src/services/storage.service';
import { handleServiceError } from '@src/utils/errorHandlers';

/******************************************************************************
                          ReportFileCleanupService

  Deletes the uploaded xlsx files of completed report jobs older than the
  retention window from the reports bucket, then blanks each job's
  storage_path so the same files are not queued again. A failed chunk is
  counted and the loop continues; the caller gets the totals.
******************************************************************************/

const RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Small chunks keep one failed delete from blocking many files.
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
      const cutoff = new Date(
        Date.now() - RETENTION_DAYS * MS_PER_DAY,
      ).toISOString();

      const candidates =
        await reportJobRepository.findCompletedJobsOlderThan(cutoff);

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
          await storageService.remove(paths);
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
