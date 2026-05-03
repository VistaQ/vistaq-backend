import supabaseService from '@src/services/supabase.service';
import pointTransactionRepository from '@src/repositories/pointTransaction.repository';

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminInsert: jest.fn(),
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

  /**
   * Builds a chained-builder mock for:
   *   from('point_transactions').select(s).eq().eq().in().in() → { data, error }
   */
  function stubChain(
    response: {
      data: unknown[] | null;
      error: { message: string } | null;
    },
  ) {
    const inMock2 = jest.fn().mockResolvedValue(response);
    const inMock1 = jest.fn().mockReturnValue({ in: inMock2 });
    const eqMock2 = jest.fn().mockReturnValue({ in: inMock1 });
    const eqMock1 = jest.fn().mockReturnValue({ eq: eqMock2 });
    const selectMock = jest.fn().mockReturnValue({ eq: eqMock1 });
    const fromMock = jest.fn().mockReturnValue({ select: selectMock });

    (supabaseService as unknown as { adminClient: { from: jest.Mock } }).adminClient = {
      from: fromMock,
    } as never;

    return { fromMock, selectMock, eqMock1, eqMock2, inMock1, inMock2 };
  }

  it('returns rows scoped to tenant + subject_ids + activities', async () => {
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
    const { fromMock, eqMock1, eqMock2, inMock1, inMock2 } = stubChain({
      data: rows,
      error: null,
    });

    const result = await pointTransactionRepository.findBySubjectIds(
      't1',
      ['b1'],
      ['sales_noc', 'sales_ace'],
    );

    expect(fromMock).toHaveBeenCalledWith('point_transactions');
    expect(eqMock1).toHaveBeenCalledWith('tenant_id', 't1');
    expect(eqMock2).toHaveBeenCalledWith('subject_type', 'upload_batch');
    expect(inMock1).toHaveBeenCalledWith('subject_id', ['b1']);
    expect(inMock2).toHaveBeenCalledWith('activity', ['sales_noc', 'sales_ace']);
    expect(result).toEqual(rows);
  });

  it('returns [] when subjectIds is empty (no DB call)', async () => {
    const { fromMock } = stubChain({ data: [], error: null });
    const result = await pointTransactionRepository.findBySubjectIds(
      't1',
      [],
      ['sales_noc'],
    );
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('returns [] when activities is empty (no DB call)', async () => {
    const { fromMock } = stubChain({ data: [], error: null });
    const result = await pointTransactionRepository.findBySubjectIds(
      't1',
      ['b1'],
      [],
    );
    expect(result).toEqual([]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('throws RepositoryError on error response', async () => {
    stubChain({ data: null, error: { message: 'boom' } });
    await expect(
      pointTransactionRepository.findBySubjectIds('t1', ['b1'], ['sales_noc']),
    ).rejects.toThrow('PointTransactionRepository.findBySubjectIds failed');
  });
});
