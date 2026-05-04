import supabaseService from '@src/services/supabase.service';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminInsert: jest.fn(),
    adminSelectInIn: jest.fn(),
    adminRpc: jest.fn(),
  },
}));

describe('PointTransactionRepository.bulkInsert', () => {
  beforeEach(() => jest.resetAllMocks());

  it('inserts the supplied rows in a single round trip', async () => {
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: [{ id: 'p1' }, { id: 'p2' }],
      error: null,
    });

    const rows = [
      {
        tenant_id: 't1',
        user_id: 'u1',
        activity: 'sales_noc',
        points: 30,
        subject_type: 'upload_batch',
        subject_id: 'b1',
      },
      {
        tenant_id: 't1',
        user_id: 'u2',
        activity: 'sales_ace',
        points: 60,
        subject_type: 'upload_batch',
        subject_id: 'b1',
      },
    ];

    await pointTransactionRepository.bulkInsert(rows);

    expect(supabaseService.adminInsert).toHaveBeenCalledTimes(1);
    expect(supabaseService.adminInsert).toHaveBeenCalledWith(
      'point_transactions',
      rows,
    );
  });

  it('returns silently on an empty rows array (no DB call)', async () => {
    await pointTransactionRepository.bulkInsert([]);
    expect(supabaseService.adminInsert).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminInsert as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'fk violation' },
    });

    await expect(
      pointTransactionRepository.bulkInsert([
        {
          tenant_id: 't1',
          user_id: 'u1',
          activity: 'sales_noc',
          points: 1,
          subject_type: 'upload_batch',
          subject_id: 'b1',
        },
      ]),
    ).rejects.toThrow('PointTransactionRepository.bulkInsert failed');
  });
});

describe('PointTransactionRepository.findBySubjectIds', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns rows scoped to tenant + subject_ids + activities via adminSelectInIn', async () => {
    const rows = [
      {
        id: 'pt1',
        tenant_id: 't1',
        user_id: 'u1',
        activity: 'sales_noc',
        points: 30,
        subject_id: 'b1',
        subject_type: 'upload_batch',
        created_at: '2026-05-01T00:00:00Z',
      },
    ];
    (supabaseService.adminSelectInIn as jest.Mock).mockResolvedValue({
      data: rows,
      error: null,
    });

    const result = await pointTransactionRepository.findBySubjectIds(
      't1',
      ['b1'],
      ['sales_noc', 'sales_ace'],
    );

    expect(supabaseService.adminSelectInIn).toHaveBeenCalledWith(
      'point_transactions',
      expect.stringContaining('id, tenant_id'),
      [
        { column: 'subject_id', values: ['b1'] },
        { column: 'activity', values: ['sales_noc', 'sales_ace'] },
      ],
      { tenant_id: 't1', subject_type: 'upload_batch' },
    );
    expect(result).toEqual(rows);
  });

  it('returns [] when subjectIds is empty (no DB call)', async () => {
    const result = await pointTransactionRepository.findBySubjectIds(
      't1',
      [],
      ['sales_noc'],
    );
    expect(result).toEqual([]);
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
  });

  it('returns [] when activities is empty (no DB call)', async () => {
    const result = await pointTransactionRepository.findBySubjectIds(
      't1',
      ['b1'],
      [],
    );
    expect(result).toEqual([]);
    expect(supabaseService.adminSelectInIn).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    (supabaseService.adminSelectInIn as jest.Mock).mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    });
    await expect(
      pointTransactionRepository.findBySubjectIds('t1', ['b1'], ['sales_noc']),
    ).rejects.toThrow('PointTransactionRepository.findBySubjectIds failed');
  });
});

describe('PointTransactionRepository.awardWithReversal', () => {
  beforeEach(() => jest.resetAllMocks());

  it('forwards the lock-protected reversal+insert to the award_sales_points_for_batch RPC', async () => {
    (supabaseService.adminRpc as jest.Mock).mockResolvedValue({ data: null, error: null });

    await pointTransactionRepository.awardWithReversal({
      tenantId: 't1',
      year: 2026,
      month: 5,
      batchId: 'batch-new',
      activities: ['sales_noc', 'sales_fyct', 'sales_ace'],
      awards: [
        { user_id: 'u1', activity: 'sales_noc', points: 120, subject_id: 'batch-new' },
      ],
    });

    expect(supabaseService.adminRpc).toHaveBeenCalledWith(
      'award_sales_points_for_batch',
      {
        p_tenant_id: 't1',
        p_year: 2026,
        p_month: 5,
        p_batch_id: 'batch-new',
        p_activities: ['sales_noc', 'sales_fyct', 'sales_ace'],
        p_awards: [
          { user_id: 'u1', activity: 'sales_noc', points: 120, subject_id: 'batch-new' },
        ],
      },
    );
  });

  it('rethrows as RepositoryError when the RPC fails', async () => {
    (supabaseService.adminRpc as jest.Mock).mockRejectedValue(new Error('lock timeout'));

    await expect(
      pointTransactionRepository.awardWithReversal({
        tenantId: 't1',
        year: 2026,
        month: 5,
        batchId: 'b',
        activities: ['sales_noc'],
        awards: [],
      }),
    ).rejects.toThrow('PointTransactionRepository.awardWithReversal failed');
  });
});
