import { EtlServiceError } from '@src/models/errors/reportJob.errors';
import type { IEtlKickoffParams } from '@src/types/reportJob.types';
import EnvVars from '@src/utils/env';

class EtlService {
  async kickoff(params: IEtlKickoffParams): Promise<void> {
    const url = `${EnvVars.EtlServiceUrl}/process`;
    try {
      if (!EnvVars.EtlServiceUrl.trim() || !EnvVars.InternalApiKey.trim()) {
        throw new EtlServiceError(
          'ETL_SERVICE_URL and ETL_API_KEY are not set',
        );
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${EnvVars.InternalApiKey}`,
        },
        body: JSON.stringify({
          job_reference: params.reference,
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
      if (error instanceof EtlServiceError) throw error;
      throw new EtlServiceError(
        `ETL service request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export const etlService = new EtlService();
export default etlService;
