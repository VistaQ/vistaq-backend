// Supply env vars before env.ts runs so the validation guards do not throw
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

// ---------------------------------------------------------------------------
// LoggingService mock — must be registered before any imports that trigger side effects
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// SupabaseService mock — prevent real client instantiation
// ---------------------------------------------------------------------------

jest.mock('@src/services/supabase.service', () => ({
  __esModule: true,
  default: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminSelectIn: jest.fn(),
    adminSelectWithJoin: jest.fn(),
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userDelete: jest.fn(),
    userSelectIn: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    adminSelectIn: jest.fn(),
    adminSelectWithJoin: jest.fn(),
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userDelete: jest.fn(),
    userSelectIn: jest.fn(),
  },
}));

import { eventRepository } from '@src/repositories/event.repository';
import supabaseService from '@src/services/supabase.service';
import { RepositoryError } from '@src/models/errors/layer.errors';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_ID_1 = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const USER_ID_2 = 'cccccccc-dddd-eeee-ffff-000000000000';
const USER_TOKEN = 'mock-user-jwt-token';

/******************************************************************************
  Test suite — EventRepository.findUsersByIdsAndRoles
******************************************************************************/

describe('EventRepository.findUsersByIdsAndRoles', () => {
  afterEach(() => jest.restoreAllMocks());

  it('selects id,role,tenant_id,status and filters out inactive users', async () => {
    const activeRow = { id: USER_ID_1, role: 'agent', tenant_id: TENANT_ID, status: 'active' };
    const inactiveRow = { id: USER_ID_2, role: 'agent', tenant_id: TENANT_ID, status: 'inactive' };

    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: [activeRow, inactiveRow],
      error: null,
    } as any);

    const result = await eventRepository.findUsersByIdsAndRoles(
      [USER_ID_1, USER_ID_2],
      USER_TOKEN,
    );

    // Only the active user is returned
    expect(result).toEqual([{ id: USER_ID_1, role: 'agent', tenant_id: TENANT_ID }]);

    // status field is selected in the query
    expect(supabaseService.userSelectIn).toHaveBeenCalledWith(
      USER_TOKEN,
      'users',
      'id,role,tenant_id,status',
      'id',
      [USER_ID_1, USER_ID_2],
    );
  });

  it('returns empty array when all returned users are inactive', async () => {
    const inactiveRow = { id: USER_ID_1, role: 'agent', tenant_id: TENANT_ID, status: 'inactive' };

    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: [inactiveRow],
      error: null,
    } as any);

    const result = await eventRepository.findUsersByIdsAndRoles(
      [USER_ID_1],
      USER_TOKEN,
    );

    expect(result).toEqual([]);
  });

  it('returns mapped users without status field in output', async () => {
    const activeRow = { id: USER_ID_1, role: 'trainer', tenant_id: TENANT_ID, status: 'active' };

    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: [activeRow],
      error: null,
    } as any);

    const result = await eventRepository.findUsersByIdsAndRoles(
      [USER_ID_1],
      USER_TOKEN,
    );

    expect(result).toEqual([{ id: USER_ID_1, role: 'trainer', tenant_id: TENANT_ID }]);
    // status should not appear in output objects
    expect((result[0] as any).status).toBeUndefined();
  });

  it('returns all active users when no inactive users present', async () => {
    const rows = [
      { id: USER_ID_1, role: 'agent', tenant_id: TENANT_ID, status: 'active' },
      { id: USER_ID_2, role: 'group_leader', tenant_id: TENANT_ID, status: 'active' },
    ];

    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: rows,
      error: null,
    } as any);

    const result = await eventRepository.findUsersByIdsAndRoles(
      [USER_ID_1, USER_ID_2],
      USER_TOKEN,
    );

    expect(result).toEqual([
      { id: USER_ID_1, role: 'agent', tenant_id: TENANT_ID },
      { id: USER_ID_2, role: 'group_leader', tenant_id: TENANT_ID },
    ]);
  });

  it('throws RepositoryError when userSelectIn returns an error', async () => {
    jest.spyOn(supabaseService, 'userSelectIn').mockResolvedValue({
      data: null,
      error: { message: 'select failed: permission denied' },
    } as any);

    await expect(
      eventRepository.findUsersByIdsAndRoles([USER_ID_1], USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
