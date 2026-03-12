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
  },
  supabaseService: {
    adminSelect: jest.fn(),
    adminInsert: jest.fn(),
    adminUpdate: jest.fn(),
    adminDelete: jest.fn(),
    userInsert: jest.fn(),
  },
}));

import { prospectService } from '@src/services/prospect.service';
import { prospectRepository } from '@src/repositories/prospect.repository';
import { ServiceError } from '@src/models/errors/layer.errors';
import type { IProspect } from '@src/types/auth.types';

/******************************************************************************
  Fixtures
******************************************************************************/

const PROSPECT_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const AGENT_ID = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
const GROUP_ID = 'cccccccc-dddd-eeee-ffff-000000000000';
const USER_TOKEN = 'mock-user-jwt-token';

const mockProspect: IProspect = {
  id: PROSPECT_ID,
  tenant_id: TENANT_ID,
  agent_id: AGENT_ID,
  group_id: GROUP_ID,
  prospect_name: 'John Doe',
  prospect_email: 'john@example.com',
  prospect_phone: '+61400000000',
  current_stage: 'prospect',
  prospect_entered_at: '2024-01-01T00:00:00.000Z',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const BASE_PARAMS = {
  prospectName: 'John Doe',
  prospectPhone: '+61400000000',
  prospectEmail: 'john@example.com',
  agentId: AGENT_ID,
  tenantId: TENANT_ID,
  groupId: GROUP_ID,
  token: USER_TOKEN,
};

/******************************************************************************
  Test suite — ProspectService.createProspect
******************************************************************************/

describe('ProspectService.createProspect', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns IProspect and calls insertProspect with correct snake_case payload including current_stage: prospect', async () => {
    jest.spyOn(prospectRepository, 'insertProspect').mockResolvedValue(mockProspect);

    const result = await prospectService.createProspect(BASE_PARAMS);

    expect(result).toEqual(mockProspect);
    expect(prospectRepository.insertProspect).toHaveBeenCalledWith(
      {
        prospect_name: 'John Doe',
        prospect_phone: '+61400000000',
        prospect_email: 'john@example.com',
        agent_id: AGENT_ID,
        tenant_id: TENANT_ID,
        group_id: GROUP_ID,
        current_stage: 'prospect',
      },
      USER_TOKEN,
    );
  });

  it('passes group_id: null in payload when groupId param is null', async () => {
    const prospectWithNullGroup: IProspect = { ...mockProspect, group_id: null };
    const insertProspectSpy = jest
      .spyOn(prospectRepository, 'insertProspect')
      .mockResolvedValue(prospectWithNullGroup);

    await prospectService.createProspect({ ...BASE_PARAMS, groupId: null });

    expect(insertProspectSpy).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: null }),
      USER_TOKEN,
    );
  });

  it('passes prospect_phone: null and prospect_email: null when optional fields are not provided', async () => {
    const prospectWithNoContact: IProspect = {
      ...mockProspect,
      prospect_email: null,
      prospect_phone: null,
    };
    const insertProspectSpy = jest
      .spyOn(prospectRepository, 'insertProspect')
      .mockResolvedValue(prospectWithNoContact);

    const { prospectPhone, prospectEmail, ...paramsWithoutOptionals } = BASE_PARAMS;
    await prospectService.createProspect(paramsWithoutOptionals);

    expect(insertProspectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prospect_phone: null,
        prospect_email: null,
      }),
      USER_TOKEN,
    );
  });

  it('throws ServiceError when repository throws', async () => {
    jest.spyOn(prospectRepository, 'insertProspect').mockRejectedValue(new Error('db failure'));

    await expect(prospectService.createProspect(BASE_PARAMS)).rejects.toThrow(ServiceError);
  });
});

/******************************************************************************
  Test suite — ProspectService.getProspects
******************************************************************************/

describe('ProspectService.getProspects', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the array of IProspect returned by the repository', async () => {
    jest.spyOn(prospectRepository, 'findAll').mockResolvedValue([mockProspect]);

    const result = await prospectService.getProspects(USER_TOKEN);

    expect(result).toEqual([mockProspect]);
    expect(prospectRepository.findAll).toHaveBeenCalledWith(USER_TOKEN);
  });

  it('throws ServiceError when repository throws', async () => {
    jest.spyOn(prospectRepository, 'findAll').mockRejectedValue(new Error('db failure'));

    await expect(prospectService.getProspects(USER_TOKEN)).rejects.toThrow(ServiceError);
  });
});

/******************************************************************************
  Test suite — ProspectService.getProspectById
******************************************************************************/

describe('ProspectService.getProspectById', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the IProspect returned by the repository', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(mockProspect);

    const result = await prospectService.getProspectById(PROSPECT_ID, USER_TOKEN);

    expect(result).toEqual(mockProspect);
    expect(prospectRepository.findById).toHaveBeenCalledWith(PROSPECT_ID, USER_TOKEN);
  });

  it('returns null when the repository returns null', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(null);

    const result = await prospectService.getProspectById(PROSPECT_ID, USER_TOKEN);

    expect(result).toBeNull();
  });

  it('throws ServiceError when repository throws', async () => {
    jest.spyOn(prospectRepository, 'findById').mockRejectedValue(new Error('db failure'));

    await expect(prospectService.getProspectById(PROSPECT_ID, USER_TOKEN)).rejects.toThrow(ServiceError);
  });
});
