import salesReportService from '@src/services/salesReport.service';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';
import userRepository from '@src/repositories/user.repository';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';
import salesReportMtdRepository from '@src/repositories/salesReportMtd.repository';
import { IEtlResult } from '@src/types/salesReport.types';
import { InvalidEtlResultError } from '@src/models/errors/salesReport.errors';

jest.mock('@src/repositories/uploadBatch.repository', () => ({
  __esModule: true,
  default: { insertBatch: jest.fn(), updateRowsLoaded: jest.fn() },
}));
jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: { findByAgentCodes: jest.fn() },
}));
jest.mock('@src/repositories/salesReportYtd.repository', () => ({
  __esModule: true,
  default: { bulkUpsert: jest.fn() },
}));
jest.mock('@src/repositories/salesReportMtd.repository', () => ({
  __esModule: true,
  default: { bulkUpsert: jest.fn() },
}));

const baseEtl: IEtlResult = {
  source: 'May2026.xlsx',
  created_at: '2026-06-01T00:00:00Z',
  rows_loaded: 2,
  months_detected: ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY'],
  report_year: 2026,
  report_month: 5,
  records: [
    {
      agentCode: 'A1',
      rowData: {
        'ACE (YTD)': 100, 'NOC (YTD)': 5, 'FYCT (YTD)': 80, '% FYCT (YTD)': 0.4,
        'MDRT SHORTAGE FYCT': 20, 'FYC (YTD)': 70, '% FYC (YTD)': 0.35,
        'MDRT SHORTAGE FYC': 30,
        'JANUARY ACE': 10, 'JANUARY NOC': 1,
        'MAY ACE': 30, 'MAY NOC': 2,
      },
    },
    {
      agentCode: 'A2',
      rowData: {
        'ACE (YTD)': 200, 'NOC (YTD)': 10, 'FYCT (YTD)': 160, '% FYCT (YTD)': 0.4,
        'MDRT SHORTAGE FYCT': 40, 'FYC (YTD)': 140, '% FYC (YTD)': 0.35,
        'MDRT SHORTAGE FYC': 60,
      },
    },
  ],
};

beforeEach(() => jest.resetAllMocks());

describe('SalesReportService.uploadReport — happy path', () => {
  it('resolves agents, bulk upserts, updates rows_loaded, returns processed count', async () => {
    (uploadBatchRepository.insertBatch as jest.Mock).mockResolvedValue({
      id: 'batch-1', tenant_id: 't1', uploaded_by: 'u-mgr',
      year: 2026, month: 5, file_name: 'May2026.xlsx', rows_loaded: 0,
      created_at: 'now',
    });
    (userRepository.findByAgentCodes as jest.Mock).mockResolvedValue([
      { id: 'u1', agent_code: 'A1' },
      { id: 'u2', agent_code: 'A2' },
    ]);

    const result = await salesReportService.uploadReport({
      etlResult: baseEtl,
      tenantId: 't1',
      uploadedBy: 'u-mgr',
    });

    expect(result.batchId).toBe('batch-1');
    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);

    expect(salesReportYtdRepository.bulkUpsert).toHaveBeenCalledTimes(1);
    const ytdRows = (salesReportYtdRepository.bulkUpsert as jest.Mock).mock.calls[0][0];
    expect(ytdRows).toHaveLength(2);
    expect(ytdRows[0]).toMatchObject({
      tenant_id: 't1', user_id: 'u1', year: 2026, month: 5, ace: 100, fyc: 70,
    });

    expect(salesReportMtdRepository.bulkUpsert).toHaveBeenCalledTimes(1);
    const mtdRows = (salesReportMtdRepository.bulkUpsert as jest.Mock).mock.calls[0][0];
    // A1 has JANUARY + MAY MTD; A2 has none → total = 2
    expect(mtdRows).toHaveLength(2);

    expect(uploadBatchRepository.updateRowsLoaded).toHaveBeenCalledWith('batch-1', 2);
  });
});

describe('SalesReportService.uploadReport — unmatched agent', () => {
  it('records skipped + errors entry without blocking processed agents', async () => {
    (uploadBatchRepository.insertBatch as jest.Mock).mockResolvedValue({ id: 'batch-1' });
    (userRepository.findByAgentCodes as jest.Mock).mockResolvedValue([
      { id: 'u1', agent_code: 'A1' },
      // A2 missing
    ]);

    const result = await salesReportService.uploadReport({
      etlResult: baseEtl, tenantId: 't1', uploadedBy: 'u-mgr',
    });

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toEqual([{ agentCode: 'A2', reason: 'User not found' }]);
    expect(uploadBatchRepository.updateRowsLoaded).toHaveBeenCalledWith('batch-1', 1);
  });
});

describe('SalesReportService.uploadReport — input errors', () => {
  it('throws InvalidEtlResultError when records is empty', async () => {
    await expect(salesReportService.uploadReport({
      etlResult: { ...baseEtl, records: [] },
      tenantId: 't1',
      uploadedBy: 'u-mgr',
    })).rejects.toThrow(InvalidEtlResultError);
  });
});

describe('SalesReportService.uploadReport — coercion of mixed rowData values', () => {
  it('coerces string and null values to numbers, defaulting non-numerics to 0', async () => {
    (uploadBatchRepository.insertBatch as jest.Mock).mockResolvedValue({ id: 'batch-c' });
    (userRepository.findByAgentCodes as jest.Mock).mockResolvedValue([
      { id: 'u1', agent_code: 'A1' },
    ]);

    const etl: IEtlResult = {
      ...baseEtl,
      records: [{
        agentCode: 'A1',
        rowData: {
          // Strings the ETL also emits — must not break the upsert
          'AGENT CODE': 'A1',
          'AGENT NAME': 'Alice',
          // Numeric values as strings (defensive coercion)
          'ACE (YTD)': '100.5' as unknown as number,
          'NOC (YTD)': null as unknown as number,
          'FYC (YTD)': 70,
          'JANUARY ACE': '15' as unknown as number,
          'JANUARY NOC': 1,
        },
      }],
    };

    await salesReportService.uploadReport({
      etlResult: etl, tenantId: 't1', uploadedBy: 'u-mgr',
    });

    const ytdRow = (salesReportYtdRepository.bulkUpsert as jest.Mock).mock.calls[0][0][0];
    expect(ytdRow.ace).toBe(100.5);  // string coerced
    expect(ytdRow.noc).toBe(0);      // null → 0
    expect(ytdRow.fyc).toBe(70);

    const mtdRow = (salesReportMtdRepository.bulkUpsert as jest.Mock).mock.calls[0][0][0];
    expect(mtdRow.month).toBe(1);
    expect(mtdRow.ace).toBe(15);
    expect(mtdRow.noc).toBe(1);
  });
});
