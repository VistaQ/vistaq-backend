import scopeService from '@src/services/scope.service';
import userRepository from '@src/repositories/user.repository';

jest.mock('@src/repositories/user.repository', () => ({
  __esModule: true,
  default: {
    findManagedGroupIdsByUserIds: jest.fn(),
    findGroupIdById: jest.fn(),
  },
}));

beforeEach(() => jest.resetAllMocks());

describe('ScopeService.resolveSalesReportScope', () => {
  const baseParams = {
    userId: 'u1',
    tenantId: 't1',
    userToken: 'tok',
  };

  it('returns { type: "all" } for admin without any DB call', async () => {
    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'admin',
    });

    expect(out).toEqual({ type: 'all' });
    expect(userRepository.findManagedGroupIdsByUserIds).not.toHaveBeenCalled();
    expect(userRepository.findGroupIdById).not.toHaveBeenCalled();
  });

  it('returns { type: "all" } for master_trainer without any DB call', async () => {
    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'master_trainer',
    });

    expect(out).toEqual({ type: 'all' });
    expect(userRepository.findManagedGroupIdsByUserIds).not.toHaveBeenCalled();
    expect(userRepository.findGroupIdById).not.toHaveBeenCalled();
  });

  it('returns the trainer\'s managed groups via group_trainers (multiple groups)', async () => {
    (userRepository.findManagedGroupIdsByUserIds as jest.Mock).mockResolvedValue(
      new Map([['u1', ['g1', 'g2']]]),
    );

    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'trainer',
    });

    expect(out).toEqual({ type: 'group_ids', groupIds: ['g1', 'g2'] });
    expect(userRepository.findManagedGroupIdsByUserIds).toHaveBeenCalledWith(
      ['u1'],
      'tok',
    );
  });

  it('returns empty group_ids for a trainer with no managed groups (NOT forbidden)', async () => {
    (userRepository.findManagedGroupIdsByUserIds as jest.Mock).mockResolvedValue(
      new Map(),
    );

    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'trainer',
    });

    expect(out).toEqual({ type: 'group_ids', groupIds: [] });
  });

  it('returns the group_leader\'s own users.group_id wrapped in a list', async () => {
    (userRepository.findGroupIdById as jest.Mock).mockResolvedValue('g-leader');

    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'group_leader',
    });

    expect(out).toEqual({ type: 'group_ids', groupIds: ['g-leader'] });
    expect(userRepository.findGroupIdById).toHaveBeenCalledWith('u1');
  });

  it('returns empty group_ids for a group_leader with null group_id', async () => {
    (userRepository.findGroupIdById as jest.Mock).mockResolvedValue(null);

    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'group_leader',
    });

    expect(out).toEqual({ type: 'group_ids', groupIds: [] });
  });

  it('returns { type: "forbidden" } for agent', async () => {
    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'agent',
    });

    expect(out).toEqual({ type: 'forbidden' });
    expect(userRepository.findManagedGroupIdsByUserIds).not.toHaveBeenCalled();
    expect(userRepository.findGroupIdById).not.toHaveBeenCalled();
  });

  it('returns { type: "forbidden" } for an unknown role', async () => {
    const out = await scopeService.resolveSalesReportScope({
      ...baseParams,
      role: 'system_intern',
    });

    expect(out).toEqual({ type: 'forbidden' });
  });
});
