import supabaseService from '@src/services/supabase.service';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminSelect: jest.fn(),
    adminSelectIn: jest.fn(),
    adminSelectPaginated: jest.fn(),
  },
}));

describe('UploadBatchRepository.insertBatch', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns the inserted batch with status and rows_skipped defaulted', async () => {
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: [{
        id: 'batch-1', tenant_id: 't1', uploaded_by: 'u1',
        year: 2026, month: 5, file_name: 'r.xlsx', rows_loaded: 0,
        rows_skipped: 0, status: 'success',
        created_at: '2026-05-02T00:00:00Z',
      }],
      error: null,
    });

    const batch = await uploadBatchRepository.insertBatch({
      tenant_id: 't1', uploaded_by: 'u1', year: 2026, month: 5,
      file_name: 'r.xlsx', rows_loaded: 0,
    });

    expect(supabaseService.adminInsert).toHaveBeenCalledWith('upload_batches', expect.objectContaining({
      tenant_id: 't1', file_name: 'r.xlsx',
    }));
    expect(batch.id).toBe('batch-1');
    expect(batch.status).toBe('success');
    expect(batch.rows_skipped).toBe(0);
  });

  it('inserts a batch with uploaded_by = null (manual ingest)', async () => {
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: [{
        id: 'batch-2', tenant_id: 't1', uploaded_by: null,
        year: 2026, month: 5, file_name: 'manual.xlsx', rows_loaded: 0,
        rows_skipped: 0, status: 'success',
        created_at: '2026-05-02T00:00:00Z',
      }],
      error: null,
    });

    const batch = await uploadBatchRepository.insertBatch({
      tenant_id: 't1', uploaded_by: null, year: 2026, month: 5,
      file_name: 'manual.xlsx', rows_loaded: 0,
    });

    expect(supabaseService.adminInsert).toHaveBeenCalledWith('upload_batches', expect.objectContaining({
      tenant_id: 't1', uploaded_by: null, file_name: 'manual.xlsx',
    }));
    expect(batch.uploaded_by).toBeNull();
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'fk violation' },
    });

    await expect(uploadBatchRepository.insertBatch({
      tenant_id: 't1', uploaded_by: 'u1', year: 2026, month: 5,
      file_name: 'r.xlsx', rows_loaded: 0,
    })).rejects.toThrow('UploadBatchRepository.insertBatch failed');
  });
});

describe('UploadBatchRepository.updateBatchSummary', () => {
  beforeEach(() => jest.resetAllMocks());

  it('persists processed count, skipped count, and success status', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ id: 'batch-1' }],
      error: null,
    });

    await uploadBatchRepository.updateBatchSummary('batch-1', {
      rows_loaded: 42,
      rows_skipped: 0,
      status: 'success',
    });

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'upload_batches',
      { rows_loaded: 42, rows_skipped: 0, status: 'success' },
      { id: 'batch-1' },
    );
  });

  it('persists partial status when some rows were skipped', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ id: 'batch-2' }],
      error: null,
    });

    await uploadBatchRepository.updateBatchSummary('batch-2', {
      rows_loaded: 8,
      rows_skipped: 2,
      status: 'partial',
    });

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'upload_batches',
      { rows_loaded: 8, rows_skipped: 2, status: 'partial' },
      { id: 'batch-2' },
    );
  });

  it('persists failed status when nothing was processed', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ id: 'batch-3' }],
      error: null,
    });

    await uploadBatchRepository.updateBatchSummary('batch-3', {
      rows_loaded: 0,
      rows_skipped: 5,
      status: 'failed',
    });

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'upload_batches',
      { rows_loaded: 0, rows_skipped: 5, status: 'failed' },
      { id: 'batch-3' },
    );
  });

  it('throws RepositoryError on adminUpdate error response', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'update failed' },
    });
    await expect(
      uploadBatchRepository.updateBatchSummary('batch-1', {
        rows_loaded: 1,
        rows_skipped: 0,
        status: 'success',
      }),
    ).rejects.toThrow('UploadBatchRepository.updateBatchSummary failed');
  });
});

describe('UploadBatchRepository.findPriorBatchIdsForPeriod', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns ids for the period, excluding the current batch', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: [{ id: 'b1' }, { id: 'b2' }, { id: 'b-current' }],
      error: null,
    });

    const out = await uploadBatchRepository.findPriorBatchIdsForPeriod(
      't1', 2026, 5, 'b-current',
    );

    expect(supabaseService.adminSelect).toHaveBeenCalledWith(
      'upload_batches',
      'id',
      { tenant_id: 't1', year: 2026, month: 5 },
    );
    expect(out).toEqual(['b1', 'b2']);
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminSelect as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });

    await expect(
      uploadBatchRepository.findPriorBatchIdsForPeriod('t1', 2026, 5, 'b-current'),
    ).rejects.toThrow('UploadBatchRepository.findPriorBatchIdsForPeriod failed');
  });
});

describe('UploadBatchRepository.findPaginatedAuditByTenant', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns mapped audit entries with uploader_name resolved via adminSelectIn', async () => {
    (supabaseService.adminSelectPaginated as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'b1',
          year: 2026,
          month: 3,
          file_name: 'input.xlsx',
          rows_loaded: 65,
          rows_skipped: 2,
          status: 'partial',
          created_at: '2026-04-29T16:01:33.000Z',
          uploaded_by: 'u1',
        },
      ],
      error: null,
      count: 12,
    });
    (supabaseService.adminSelectIn as jest.Mock).mockResolvedValue({
      data: [{ id: 'u1', name: 'Jane Doe' }],
      error: null,
    });

    const result = await uploadBatchRepository.findPaginatedAuditByTenant(
      't1', 2026, 1, 50,
    );

    expect(supabaseService.adminSelectPaginated).toHaveBeenCalledWith(
      'upload_batches',
      expect.stringContaining('uploaded_by'),
      { tenant_id: 't1', year: 2026 },
      { column: 'created_at', ascending: false },
      { from: 0, to: 49 },
    );
    expect(supabaseService.adminSelectIn).toHaveBeenCalledWith(
      'users',
      'id, name',
      'id',
      ['u1'],
    );
    expect(result.data).toEqual([
      {
        id: 'b1',
        year: 2026,
        month: 3,
        file_name: 'input.xlsx',
        rows_loaded: 65,
        rows_skipped: 2,
        status: 'partial',
        uploader_name: 'Jane Doe',
        imported_at: '2026-04-29T16:01:33.000Z',
      },
    ]);
    expect(result.meta).toEqual({ page: 1, pageSize: 50, total: 12 });
  });

  it('returns null uploader_name when uploaded_by is null (manual ingest)', async () => {
    (supabaseService.adminSelectPaginated as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 'b2',
          year: 2026,
          month: 4,
          file_name: 'manual.xlsx',
          rows_loaded: 10,
          rows_skipped: 0,
          status: 'success',
          created_at: '2026-05-01T00:00:00.000Z',
          uploaded_by: null,
        },
      ],
      error: null,
      count: 1,
    });

    const result = await uploadBatchRepository.findPaginatedAuditByTenant(
      't1', 2026, 1, 50,
    );

    expect(result.data[0].uploader_name).toBeNull();
    // No uploader IDs to resolve → users query is skipped.
    expect(supabaseService.adminSelectIn).not.toHaveBeenCalled();
  });

  it('computes range from page/pageSize for the second page', async () => {
    (supabaseService.adminSelectPaginated as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
      count: 0,
    });

    await uploadBatchRepository.findPaginatedAuditByTenant('t1', 2026, 2, 25);

    expect(supabaseService.adminSelectPaginated).toHaveBeenCalledWith(
      'upload_batches',
      expect.any(String),
      { tenant_id: 't1', year: 2026 },
      { column: 'created_at', ascending: false },
      { from: 25, to: 49 },
    );
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminSelectPaginated as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
      count: null,
    });

    await expect(
      uploadBatchRepository.findPaginatedAuditByTenant('t1', 2026, 1, 50),
    ).rejects.toThrow('UploadBatchRepository.findPaginatedAuditByTenant failed');
  });
});
