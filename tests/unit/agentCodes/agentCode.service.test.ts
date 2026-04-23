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
  default: { userUpsert: jest.fn() },
  supabaseService: { userUpsert: jest.fn() },
}));

import { agentCodeService } from '@src/services/agentCode.service';
import { agentCodeRepository } from '@src/repositories/agentCode.repository';
import { ServiceError } from '@src/models/errors/layer.errors';
import type { IAgentCode } from '@src/types/agentCode';

/******************************************************************************
  Fixtures
******************************************************************************/

const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const USER_TOKEN = 'mock-user-jwt-token';

const mockResult: IAgentCode[] = [
  {
    agent_code: 'ABC123',
    is_used: false,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  },
  {
    agent_code: 'DEF456',
    is_used: false,
    created_at: '2026-04-23T00:00:00.000Z',
    updated_at: '2026-04-23T00:00:00.000Z',
  },
];

/******************************************************************************
  Test suite — AgentCodeService.createMany
******************************************************************************/

describe('AgentCodeService.createMany', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes deduplicated rows with tenant_id stamped to repository', async () => {
    const spy = jest
      .spyOn(agentCodeRepository, 'upsertMany')
      .mockResolvedValue(mockResult);

    await agentCodeService.createMany({
      agentCodes: ['ABC123', 'ABC123', 'DEF456'],
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });

    expect(spy).toHaveBeenCalledWith(
      [
        { tenant_id: TENANT_ID, agent_code: 'ABC123' },
        { tenant_id: TENANT_ID, agent_code: 'DEF456' },
      ],
      USER_TOKEN,
    );
  });

  it('returns IAgentCode[] from repository unchanged', async () => {
    jest.spyOn(agentCodeRepository, 'upsertMany').mockResolvedValue(mockResult);

    const result = await agentCodeService.createMany({
      agentCodes: ['ABC123', 'DEF456'],
      tenantId: TENANT_ID,
      token: USER_TOKEN,
    });

    expect(result).toEqual(mockResult);
  });

  it('throws ServiceError when repository throws', async () => {
    jest
      .spyOn(agentCodeRepository, 'upsertMany')
      .mockRejectedValue(new Error('db failure'));

    await expect(
      agentCodeService.createMany({
        agentCodes: ['X'],
        tenantId: TENANT_ID,
        token: USER_TOKEN,
      }),
    ).rejects.toThrow(ServiceError);
  });
});
