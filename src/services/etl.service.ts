import { EtlServiceError } from '@src/models/errors/reportJob.errors';
import { IEtlKickoffParams } from '@src/types/reportJob.types';
import EnvVars from '@src/utils/env';
import loggingService from '@src/services/logging.service';

class EtlService {
  async kickoff(params: IEtlKickoffParams): Promise<void> {
    const url = `${EnvVars.EtlServiceUrl}/process`;
    try {
      loggingService.info('EtlService.kickoff called', { jobId: params.jobId, url });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${EnvVars.InternalApiKey}`,
        },
        body: JSON.stringify({
          job_id: params.jobId,
          file_url: params.fileUrl,
          callback_url: params.callbackUrl,
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new EtlServiceError(
          `ETL service returned ${response.status}: ${text}`,
        );
      }
    } catch (error) {
      loggingService.error('EtlService.kickoff failed', error, { jobId: params.jobId });
      if (error instanceof EtlServiceError) throw error;
      throw new EtlServiceError(
        `ETL service request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const etlService = new EtlService();
export default etlService;
