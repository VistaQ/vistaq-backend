import supabaseService from '@src/services/supabase.service';
import uploadBatchRepository from '@src/repositories/uploadBatch.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
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

describe('UploadBatchRepository.findPaginatedAuditByTenant', () => {
  beforeEach(() => jest.resetAllMocks());

  /**
   * Builds the chained-builder mock for the two queries the repo runs:
   * 1. `from('upload_batches').select(..., { count }).eq().eq().order().range()`
   * 2. `from('users').select('id, name').in('id', [...])`
   */
  function stubQueryChain(
    batches: {
      data: unknown[] | null;
      error: { message: string } | null;
      count: number | null;
    },
    users: {
      data: { id: string; name: string }[] | null;
      error: { message: string } | null;
    } = { data: [], error: null },
  ) {
    const rangeMock = jest.fn().mockResolvedValue(batches);
    const orderMock = jest.fn().mockReturnValue({ range: rangeMock });
    const eqMock2 = jest.fn().mockReturnValue({ order: orderMock });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });

    const inMock = jest.fn().mockResolvedValue(users);
    const usersSelectMock = jest.fn().mockReturnValue({ in: inMock });

    const fromMock = jest.fn((table: string) => {
      if (table === 'upload_batches') return { select: selectMock };
      if (table === 'users') return { select: usersSelectMock };
      throw new Error(`unexpected table: ${table}`);
    });

    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;
    return {
      fromMock,
      selectMock,
      eqMock1,
      eqMock2,
      orderMock,
      rangeMock,
      usersSelectMock,
      inMock,
    };
  }

  it('returns mapped audit entries with uploader_name resolved via a separate users query', async () => {
    const { fromMock, selectMock, orderMock, rangeMock, inMock } = stubQueryChain(
      {
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
      },
      { data: [{ id: 'u1', name: 'Jane Doe' }], error: null },
    );

    const result = await uploadBatchRepository.findPaginatedAuditByTenant(
      't1', 2026, 1, 50,
    );

    expect(fromMock).toHaveBeenCalledWith('upload_batches');
    expect(selectMock).toHaveBeenCalledWith(
      expect.stringContaining('uploaded_by'),
      { count: 'exact' },
    );
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rangeMock).toHaveBeenCalledWith(0, 49);
    expect(inMock).toHaveBeenCalledWith('id', ['u1']);
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
    const { inMock } = stubQueryChain({
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
    expect(inMock).not.toHaveBeenCalled();
  });

  it('computes range from page/pageSize for the second page', async () => {
    const { rangeMock } = stubQueryChain({ data: [], error: null, count: 0 });

    await uploadBatchRepository.findPaginatedAuditByTenant('t1', 2026, 2, 25);

    expect(rangeMock).toHaveBeenCalledWith(25, 49);
  });

  it('throws RepositoryError on error response', async () => {
    stubQueryChain({
      data: null,
      error: { message: 'boom' },
      count: null,
    });

    await expect(
      uploadBatchRepository.findPaginatedAuditByTenant('t1', 2026, 1, 50),
    ).rejects.toThrow('UploadBatchRepository.findPaginatedAuditByTenant failed');
  });
});
