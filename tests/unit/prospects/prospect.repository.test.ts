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
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userDelete: jest.fn(),
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    userInsert: jest.fn(),
    userSelect: jest.fn(),
    userUpdate: jest.fn(),
    userDelete: jest.fn(),
  },
}));

import { prospectRepository } from '@src/repositories/prospect.repository';
import supabaseService from '@src/services/supabase.service';
import { RepositoryError } from '@src/models/errors/layer.errors';

/******************************************************************************
  Fixtures
******************************************************************************/

const PROSPECT_ID = '11111111-2222-3333-4444-555555555555';
const USER_TOKEN = 'mock-user-jwt-token';

/******************************************************************************
  Test suite — ProspectRepository.deleteProspect
******************************************************************************/

describe('ProspectRepository.deleteProspect', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves without throwing when userDelete returns no error', async () => {
    jest.spyOn(supabaseService, 'userDelete').mockResolvedValue({
      data: [],
      error: null,
    } as any);

    await expect(
      prospectRepository.deleteProspect(PROSPECT_ID, USER_TOKEN),
    ).resolves.toBeUndefined();

    expect(supabaseService.userDelete).toHaveBeenCalledWith(
      USER_TOKEN,
      'prospects',
      { id: PROSPECT_ID },
    );
  });

  it('throws RepositoryError when userDelete returns a truthy error object', async () => {
    jest.spyOn(supabaseService, 'userDelete').mockResolvedValue({
      data: null,
      error: { message: 'delete failed: permission denied' },
    } as any);

    await expect(
      prospectRepository.deleteProspect(PROSPECT_ID, USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('throws RepositoryError when userDelete itself throws', async () => {
    jest.spyOn(supabaseService, 'userDelete').mockRejectedValue(
      new Error('network error'),
    );

    await expect(
      prospectRepository.deleteProspect(PROSPECT_ID, USER_TOKEN),
    ).rejects.toBeInstanceOf(RepositoryError);
  });
});
