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

  it('returns the inserted batch', async () => {
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: [{
        id: 'batch-1', tenant_id: 't1', uploaded_by: 'u1',
        year: 2026, month: 5, file_name: 'r.xlsx', rows_loaded: 0,
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

describe('UploadBatchRepository.updateRowsLoaded', () => {
  beforeEach(() => jest.resetAllMocks());

  it('calls adminUpdate with the batch id and the new count', async () => {
    (supabaseService.adminUpdate as jest.Mock).mockResolvedValue({
      data: [{ id: 'batch-1', rows_loaded: 42 }],
      error: null,
    });

    await uploadBatchRepository.updateRowsLoaded('batch-1', 42);

    expect(supabaseService.adminUpdate).toHaveBeenCalledWith(
      'upload_batches',
      { rows_loaded: 42 },
      { id: 'batch-1' },
    );
  });
});
