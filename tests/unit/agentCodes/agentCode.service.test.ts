const mockCreateMany = jest.fn();
const mockFindAll = jest.fn();
const mockRename = jest.fn();
const mockFindByCode = jest.fn();
const mockDeleteByCode = jest.fn();

jest.mock('@src/repositories/agentCode.repository', () => ({
  __esModule: true,
  default: {
    createMany: mockCreateMany,
    findAll: mockFindAll,
    rename: mockRename,
    findByCode: mockFindByCode,
    deleteByCode: mockDeleteByCode,
  },
}));

import {
  AgentCodeConflictError,
  AgentCodeInUseError,
  AgentCodeNotFoundError,
} from '@src/models/errors/agentCode.errors';
import { RepositoryError, ServiceError } from '@src/models/errors/layer.errors';
import agentCodeService from '@src/services/agentCode.service';
import type { IAgentCode } from '@src/types/agentCode';

const code = (agent_code: string, is_used = false): IAgentCode => ({
  agent_code,
  is_used,
  user_id: is_used ? 'u1' : null,
  created_at: '2026-04-23T00:00:00.000Z',
  updated_at: '2026-04-23T00:00:00.000Z',
});

beforeEach(() => jest.resetAllMocks());

describe('AgentCodeService.createMany', () => {
  it('creates each distinct code once', async () => {
    mockCreateMany.mockResolvedValue([code('A1'), code('B2')]);

    const result = await agentCodeService.createMany({
      agentCodes: ['A1', 'B2', 'A1'],
    });

    expect(mockCreateMany).toHaveBeenCalledWith(['A1', 'B2']);
    expect(result).toHaveLength(2);
  });

  it('wraps a repository failure in ServiceError', async () => {
    mockCreateMany.mockRejectedValue(new Error('db'));

    await expect(
      agentCodeService.createMany({ agentCodes: ['A1'] }),
    ).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('AgentCodeService.list', () => {
  it('passes no filter when isUsed is not given', async () => {
    mockFindAll.mockResolvedValue([]);

    await agentCodeService.list({});

    expect(mockFindAll).toHaveBeenCalledWith(undefined);
  });

  it.each([true, false])('filters by is_used = %s', async (isUsed) => {
    mockFindAll.mockResolvedValue([]);

    await agentCodeService.list({ isUsed });

    expect(mockFindAll).toHaveBeenCalledWith({ is_used: isUsed });
  });
});

describe('AgentCodeService.update', () => {
  const params = { currentAgentCode: 'A1', newAgentCode: 'A2' };

  it('renames the code', async () => {
    mockRename.mockResolvedValue(code('A2'));

    expect(await agentCodeService.update(params)).toEqual(code('A2'));
    expect(mockRename).toHaveBeenCalledWith('A1', 'A2');
  });

  it.each([new AgentCodeNotFoundError(), new AgentCodeConflictError()])(
    'rethrows %p found anywhere in the cause chain',
    async (domainError) => {
      mockRename.mockRejectedValue(new RepositoryError('rename failed', domainError));

      await expect(agentCodeService.update(params)).rejects.toBe(domainError);
    },
  );

  it('wraps an unexpected failure in ServiceError', async () => {
    mockRename.mockRejectedValue(new Error('db'));

    await expect(agentCodeService.update(params)).rejects.toBeInstanceOf(ServiceError);
  });
});

describe('AgentCodeService.remove', () => {
  it('deletes an unused code', async () => {
    mockFindByCode.mockResolvedValue(code('A1'));
    mockDeleteByCode.mockResolvedValue(undefined);

    await agentCodeService.remove({ agentCode: 'A1' });

    expect(mockFindByCode).toHaveBeenCalledWith('A1', { consistent: true });
    expect(mockDeleteByCode).toHaveBeenCalledWith('A1');
  });

  it('throws AgentCodeNotFoundError for an unknown code', async () => {
    mockFindByCode.mockResolvedValue(null);

    await expect(agentCodeService.remove({ agentCode: 'A1' })).rejects.toBeInstanceOf(
      AgentCodeNotFoundError,
    );
    expect(mockDeleteByCode).not.toHaveBeenCalled();
  });

  it('throws AgentCodeInUseError for a used code and keeps it', async () => {
    mockFindByCode.mockResolvedValue(code('A1', true));

    await expect(agentCodeService.remove({ agentCode: 'A1' })).rejects.toBeInstanceOf(
      AgentCodeInUseError,
    );
    expect(mockDeleteByCode).not.toHaveBeenCalled();
  });
});
