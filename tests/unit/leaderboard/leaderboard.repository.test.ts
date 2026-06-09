// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

jest.mock('@src/services/logging.service', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  loggingService: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: { adminRpc: jest.fn() },
}));

import leaderboardRepository from '@src/repositories/leaderboard.repository';
import supabaseService from '@src/services/supabase.service';
import { RepositoryError } from '@src/models/errors/layer.errors';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const PERIOD_START = '2026-06-01T00:00:00.000Z';

/******************************************************************************
  Test suite — LeaderboardRepository.getStats
******************************************************************************/

describe('LeaderboardRepository.getStats', () => {
  beforeEach(() => jest.resetAllMocks());

  it('calls adminRpc with get_leaderboard_stats, tenant_id, period_start, and p_period="mtd"', async () => {
    (supabaseService.adminRpc as jest.Mock).mockResolvedValue({
      data: { individual: [], groups: [] },
      error: null,
    });

    await leaderboardRepository.getStats(TENANT_ID, PERIOD_START, 'mtd');

    expect(supabaseService.adminRpc).toHaveBeenCalledTimes(1);
    expect(supabaseService.adminRpc).toHaveBeenCalledWith(
      'get_leaderboard_stats',
      {
        p_tenant_id: TENANT_ID,
        p_period_start: PERIOD_START,
        p_period: 'mtd',
      },
    );
  });

  it('calls adminRpc with p_period="ytd" when period is ytd', async () => {
    (supabaseService.adminRpc as jest.Mock).mockResolvedValue({
      data: { individual: [], groups: [] },
      error: null,
    });

    await leaderboardRepository.getStats(TENANT_ID, PERIOD_START, 'ytd');

    expect(supabaseService.adminRpc).toHaveBeenCalledWith(
      'get_leaderboard_stats',
      {
        p_tenant_id: TENANT_ID,
        p_period_start: PERIOD_START,
        p_period: 'ytd',
      },
    );
  });

  it('returns the raw RPC response unchanged for the service to interpret', async () => {
    const rpcResponse = {
      data: {
        individual: [
          {
            user_id: 'u1',
            name: 'A',
            agent_code: 'X1',
            group_id: null,
            group_name: null,
            prospects_added: 0,
            appointments_completed: 0,
            sales_meetings: 0,
            sales_successful: 0,
            total_points: 0,
            ace: 0,
            fyc: 0,
            fyct: 0,
          },
        ],
        groups: [],
      },
      error: null,
    };
    (supabaseService.adminRpc as jest.Mock).mockResolvedValue(rpcResponse);

    const result = await leaderboardRepository.getStats(TENANT_ID, PERIOD_START, 'mtd');

    expect(result).toEqual(rpcResponse);
  });

  it('wraps unexpected adminRpc errors in RepositoryError', async () => {
    (supabaseService.adminRpc as jest.Mock).mockRejectedValue(
      new Error('rpc network failure'),
    );

    await expect(
      leaderboardRepository.getStats(TENANT_ID, PERIOD_START, 'mtd'),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
