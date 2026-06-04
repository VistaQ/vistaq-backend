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

import leaderboardService from '@src/services/leaderboard.service';
import leaderboardRepository from '@src/repositories/leaderboard.repository';
import { ServiceError } from '@src/models/errors/layer.errors';
import type {
  ILeaderboardStatsGroup,
  ILeaderboardStatsIndividual,
} from '@src/types/leaderboard.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const mockIndividual: ILeaderboardStatsIndividual[] = [
  {
    user_id: 'user-uuid-1',
    name: 'Alice Agent',
    agent_code: 'AGT001',
    group_id: 'group-uuid-1',
    group_name: 'MDRT Stars',
    prospects_added: 12,
    appointments_completed: 8,
    sales_meetings: 5,
    sales_successful: 3,
    total_points: 150,
    ace: 50000.5,
    fyc: 12000,
    fyct: 8000,
  },
  {
    user_id: 'user-uuid-2',
    name: 'Bob Agent',
    agent_code: 'AGT002',
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
];

const mockGroups: ILeaderboardStatsGroup[] = [
  {
    group_id: 'group-uuid-1',
    group_name: 'MDRT Stars',
    leader_name: 'Lead Leader',
    member_count: 7,
    prospects_added: 42,
    appointments_completed: 28,
    sales_meetings: 14,
    sales_successful: 9,
    total_points: 540,
    ace: 250000.75,
    fyc: 60000,
    fyct: 40000,
  },
];

/******************************************************************************
  Test suite — LeaderboardService.getStats
******************************************************************************/

describe('LeaderboardService.getStats', () => {
  afterEach(() => jest.restoreAllMocks());

  it('forwards period="mtd" to the repository', async () => {
    const spy = jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: mockIndividual, groups: mockGroups },
    } as never);

    await leaderboardService.getStats(TENANT_ID, 'mtd');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(String),
      'mtd',
    );
  });

  it('forwards period="ytd" to the repository', async () => {
    const spy = jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: mockIndividual, groups: mockGroups },
    } as never);

    await leaderboardService.getStats(TENANT_ID, 'ytd');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(String),
      'ytd',
    );
  });

  it('passes a periodStart at the start of the current month in UTC when period="mtd"', async () => {
    const spy = jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: [], groups: [] },
    } as never);

    await leaderboardService.getStats(TENANT_ID, 'mtd');

    const periodStart = spy.mock.calls[0][1];
    const parsed = new Date(periodStart);
    const now = new Date();
    expect(parsed.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(parsed.getUTCMonth()).toBe(now.getUTCMonth());
    expect(parsed.getUTCDate()).toBe(1);
    expect(parsed.getUTCHours()).toBe(0);
  });

  it('passes a periodStart at the start of the current year in UTC when period="ytd"', async () => {
    const spy = jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: [], groups: [] },
    } as never);

    await leaderboardService.getStats(TENANT_ID, 'ytd');

    const periodStart = spy.mock.calls[0][1];
    const parsed = new Date(periodStart);
    const now = new Date();
    expect(parsed.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(parsed.getUTCMonth()).toBe(0);
    expect(parsed.getUTCDate()).toBe(1);
    expect(parsed.getUTCHours()).toBe(0);
  });

  it('returns ace, fyc, fyct on individual entries untouched from the RPC response', async () => {
    jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: mockIndividual, groups: mockGroups },
    } as never);

    const result = await leaderboardService.getStats(TENANT_ID, 'mtd');

    expect(result.individual).toEqual(mockIndividual);
    expect(result.individual[0].ace).toBe(50000.5);
    expect(result.individual[0].fyc).toBe(12000);
    expect(result.individual[0].fyct).toBe(8000);
    expect(result.individual[1].ace).toBe(0);
    expect(result.individual[1].fyc).toBe(0);
    expect(result.individual[1].fyct).toBe(0);
  });

  it('returns ace, fyc, fyct on group entries untouched from the RPC response', async () => {
    jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: mockIndividual, groups: mockGroups },
    } as never);

    const result = await leaderboardService.getStats(TENANT_ID, 'mtd');

    expect(result.groups).toEqual(mockGroups);
    expect(result.groups[0].ace).toBe(250000.75);
    expect(result.groups[0].fyc).toBe(60000);
    expect(result.groups[0].fyct).toBe(40000);
  });

  it('echoes the period back on the response payload', async () => {
    jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: { individual: [], groups: [] },
    } as never);

    const mtd = await leaderboardService.getStats(TENANT_ID, 'mtd');
    const ytd = await leaderboardService.getStats(TENANT_ID, 'ytd');

    expect(mtd.period).toBe('mtd');
    expect(ytd.period).toBe('ytd');
  });

  it('returns empty arrays when the RPC payload is empty', async () => {
    jest.spyOn(leaderboardRepository, 'getStats').mockResolvedValue({
      data: {},
    } as never);

    const result = await leaderboardService.getStats(TENANT_ID, 'mtd');

    expect(result.individual).toEqual([]);
    expect(result.groups).toEqual([]);
  });

  it('wraps unexpected repository errors in ServiceError', async () => {
    jest
      .spyOn(leaderboardRepository, 'getStats')
      .mockRejectedValue(new Error('rpc failure'));

    await expect(
      leaderboardService.getStats(TENANT_ID, 'mtd'),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
