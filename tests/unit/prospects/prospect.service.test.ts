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
import { ProspectNotFoundError } from '@src/models/errors/prospect.errors';
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
  prospect_name: 'John Doe',
  prospect_email: 'john@example.com',
  prospect_phone: '+61400000000',
  current_stage: 'prospect',
  prospect_entered_at: '2024-01-01T00:00:00.000Z',
  stage_history: [],
  appointment_date: null,
  appointment_start_time: null,
  appointment_end_time: null,
  appointment_location: null,
  appointment_status: null,
  appointment_completed_at: null,
  sales_parts_completed: null,
  products_sold: null,
  sales_outcome: null,
  unsuccessful_reason: null,
  sales_completed_at: null,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
};

const BASE_PARAMS = {
  prospectName: 'John Doe',
  prospectPhone: '+61400000000',
  prospectEmail: 'john@example.com',
  agentId: AGENT_ID,
  tenantId: TENANT_ID,
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
        current_stage: 'prospect',
      },
      USER_TOKEN,
    );
  });

  it('calls insertProspect without group_id (column was dropped)', async () => {
    const insertProspectSpy = jest
      .spyOn(prospectRepository, 'insertProspect')
      .mockResolvedValue(mockProspect);

    await prospectService.createProspect(BASE_PARAMS);

    expect(insertProspectSpy).toHaveBeenCalledWith(
      expect.not.objectContaining({ group_id: expect.anything() }),
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

/******************************************************************************
  Test suite — ProspectService.deleteProspect
******************************************************************************/

describe('ProspectService.deleteProspect', () => {
  afterEach(() => jest.restoreAllMocks());

  const baseDeleteParams = { prospectId: PROSPECT_ID, userId: AGENT_ID, role: 'agent', token: USER_TOKEN };

  it('throws ProspectNotFoundError when findById returns null', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(null);

    await expect(
      prospectService.deleteProspect(baseDeleteParams),
    ).rejects.toThrow(ProspectNotFoundError);
  });

  it('throws ProspectNotFoundError when prospect exists but agent_id does not match userId', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(mockProspect);

    await expect(
      prospectService.deleteProspect({ ...baseDeleteParams, userId: 'different-user-id', role: 'group_leader' }),
    ).rejects.toThrow(ProspectNotFoundError);
  });

  it('skips ownership check when role is admin', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(mockProspect);
    const deleteSpy = jest.spyOn(prospectRepository, 'deleteProspect').mockResolvedValue(undefined);

    await prospectService.deleteProspect({ ...baseDeleteParams, userId: 'different-user-id', role: 'admin' });

    expect(deleteSpy).toHaveBeenCalledWith(PROSPECT_ID, USER_TOKEN);
  });

  it('calls repository deleteProspect when findById returns a prospect and userId matches', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(mockProspect);
    const deleteSpy = jest
      .spyOn(prospectRepository, 'deleteProspect')
      .mockResolvedValue(undefined);

    await prospectService.deleteProspect(baseDeleteParams);

    expect(deleteSpy).toHaveBeenCalledWith(PROSPECT_ID, USER_TOKEN);
  });

  it('re-throws ProspectNotFoundError without wrapping it in ServiceError', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(null);

    const error = await prospectService
      .deleteProspect(baseDeleteParams)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ProspectNotFoundError);
    expect(error).not.toBeInstanceOf(ServiceError);
  });

  it('throws ServiceError when repository deleteProspect throws a non-domain error', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(mockProspect);
    jest.spyOn(prospectRepository, 'deleteProspect').mockRejectedValue(new Error('db failure'));

    await expect(
      prospectService.deleteProspect(baseDeleteParams),
    ).rejects.toThrow(ServiceError);
  });
});

/******************************************************************************
  Test suite — ProspectService.updateProspect
******************************************************************************/

describe('ProspectService.updateProspect', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls updateProspect without stage_history when stage has not changed', async () => {
    const existingProspect: IProspect = {
      ...mockProspect,
      current_stage: 'prospect',
      stage_history: [],
    };
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(existingProspect);
    const updateSpy = jest
      .spyOn(prospectRepository, 'updateProspect')
      .mockResolvedValue({ ...existingProspect, appointment_status: 'scheduled' });

    const result = await prospectService.updateProspect({
      prospectId: PROSPECT_ID,
      token: USER_TOKEN,
      data: { currentStage: 'prospect', appointmentStatus: 'scheduled' },
    });

    expect(updateSpy).toHaveBeenCalledWith(
      PROSPECT_ID,
      expect.not.objectContaining({ stage_history: expect.anything() }),
      USER_TOKEN,
    );
    expect(result.appointment_status).toBe('scheduled');
  });

  it('calls updateProspect with appended stage_history entry when stage changes', async () => {
    const existingProspect: IProspect = {
      ...mockProspect,
      current_stage: 'prospect',
      stage_history: [],
    };
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(existingProspect);
    const updatedProspect: IProspect = {
      ...existingProspect,
      current_stage: 'appointment',
      stage_history: [{ stage: 'appointment', enteredAt: '2024-06-01T00:00:00.000Z' }],
    };
    const updateSpy = jest
      .spyOn(prospectRepository, 'updateProspect')
      .mockResolvedValue(updatedProspect);

    await prospectService.updateProspect({
      prospectId: PROSPECT_ID,
      token: USER_TOKEN,
      data: { currentStage: 'appointment' },
    });

    expect(updateSpy).toHaveBeenCalledWith(
      PROSPECT_ID,
      expect.objectContaining({
        current_stage: 'appointment',
        stage_history: [{ stage: 'appointment', enteredAt: expect.any(String) }],
      }),
      USER_TOKEN,
    );
  });

  it('throws ProspectNotFoundError when findById returns null', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(null);

    await expect(
      prospectService.updateProspect({
        prospectId: PROSPECT_ID,
        token: USER_TOKEN,
        data: { appointmentStatus: 'scheduled' },
      }),
    ).rejects.toThrow(ProspectNotFoundError);
  });

  it('throws ServiceError when repository updateProspect throws', async () => {
    jest.spyOn(prospectRepository, 'findById').mockResolvedValue(mockProspect);
    jest.spyOn(prospectRepository, 'updateProspect').mockRejectedValue(new Error('db failure'));

    await expect(
      prospectService.updateProspect({
        prospectId: PROSPECT_ID,
        token: USER_TOKEN,
        data: { appointmentStatus: 'scheduled' },
      }),
    ).rejects.toThrow(ServiceError);
  });
});
