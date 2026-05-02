import etlService from '@src/services/etl.service';
import { EtlServiceError } from '@src/models/errors/reportJob.errors';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

beforeEach(() => {
  process.env.ETL_SERVICE_URL = 'http://etl';
  process.env.INTERNAL_API_KEY = 'test-key';
});

describe('EtlService.kickoff', () => {
  it('POSTs the job payload with the bearer key', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ accepted: true }),
    });
    global.fetch = fetchMock as never;

    await etlService.kickoff({
      jobId: 'j1', fileUrl: 'https://signed/', callbackUrl: 'https://api/cb',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://etl/process');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      job_id: 'j1', file_url: 'https://signed/', callback_url: 'https://api/cb',
    });
  });

  it('throws EtlServiceError when ETL returns non-2xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 502, text: async () => 'bad gateway',
    }) as never;

    await expect(
      etlService.kickoff({ jobId: 'j1', fileUrl: 'u', callbackUrl: 'c' }),
    ).rejects.toBeInstanceOf(EtlServiceError);
  });

  it('throws EtlServiceError when fetch rejects (network failure)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;

    await expect(
      etlService.kickoff({ jobId: 'j1', fileUrl: 'u', callbackUrl: 'c' }),
    ).rejects.toBeInstanceOf(EtlServiceError);
  });
});
