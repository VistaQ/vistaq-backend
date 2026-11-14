import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindActivityType,
  mockFindConfig,
  mockAwardOnce,
  mockFindGuards,
  mockFindSession,
} = vi.hoisted(() => ({
  mockFindActivityType: vi.fn(),
  mockFindConfig: vi.fn(),
  mockAwardOnce: vi.fn(),
  mockFindGuards: vi.fn(),
  mockFindSession: vi.fn(),
}));

vi.mock('@src/repositories/pointActivityType.repository', () => ({
  __esModule: true,
  default: { findByName: mockFindActivityType },
}));

vi.mock('@src/repositories/pointConfig.repository', () => ({
  __esModule: true,
  default: { findByActivity: mockFindConfig },
}));

vi.mock('@src/repositories/pointTransaction.repository', () => ({
  __esModule: true,
  default: { awardOnce: mockAwardOnce, findGuards: mockFindGuards },
}));

vi.mock('@src/repositories/coachingSession.repository', () => ({
  __esModule: true,
  default: { findById: mockFindSession },
}));

import {
  awardPointsService,
  detectProspectActivity,
  isAttendanceJoin,
  sessionHours,
} from '@src/services/awardPoints.service';
import type { IStreamChange } from '@src/types/stream.types';

const change = (
  eventName: IStreamChange['eventName'],
  oldImage?: Record<string, unknown>,
  newImage?: Record<string, unknown>,
): IStreamChange => ({ eventName, oldImage, newImage });

describe('detectProspectActivity', () => {
  it('maps an INSERT to prospect_created', () => {
    expect(detectProspectActivity(change('INSERT', undefined, { id: 'p1' }))).toBe(
      'prospect_created',
    );
  });

  it('maps a REMOVE to prospect_deleted', () => {
    expect(detectProspectActivity(change('REMOVE', { id: 'p1' }))).toBe(
      'prospect_deleted',
    );
  });

  it('maps appointment_status becoming scheduled to appointment_set', () => {
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          { appointment_status: 'pending' },
          { appointment_status: 'scheduled' },
        ),
      ),
    ).toBe('appointment_set');
  });

  it('maps appointment_status becoming done to sales_meeting', () => {
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          { appointment_status: 'scheduled' },
          { appointment_status: 'done' },
        ),
      ),
    ).toBe('sales_meeting');
  });

  it('maps sales_completed_at becoming set to sale_closed', () => {
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          { id: 'p1' },
          { id: 'p1', sales_completed_at: '2026-03-01T00:00:00.000Z' },
        ),
      ),
    ).toBe('sale_closed');
  });

  it('counts only the first activity when an update matches several', () => {
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          { appointment_status: 'pending' },
          {
            appointment_status: 'scheduled',
            sales_completed_at: '2026-03-01T00:00:00.000Z',
          },
        ),
      ),
    ).toBe('appointment_set');
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          { appointment_status: 'scheduled' },
          {
            appointment_status: 'done',
            sales_completed_at: '2026-03-01T00:00:00.000Z',
          },
        ),
      ),
    ).toBe('sales_meeting');
  });

  it('returns null when nothing relevant changed', () => {
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          { appointment_status: 'scheduled', prospect_name: 'A' },
          { appointment_status: 'scheduled', prospect_name: 'B' },
        ),
      ),
    ).toBeNull();
  });

  it('returns null when the appointment was already scheduled or the sale already set', () => {
    expect(
      detectProspectActivity(
        change(
          'MODIFY',
          {
            appointment_status: 'done',
            sales_completed_at: '2026-03-01T00:00:00.000Z',
          },
          {
            appointment_status: 'done',
            sales_completed_at: '2026-03-02T00:00:00.000Z',
          },
        ),
      ),
    ).toBeNull();
  });
});

describe('isAttendanceJoin', () => {
  it('is true for an INSERT already joined', () => {
    expect(isAttendanceJoin(change('INSERT', undefined, { status: 'joined' }))).toBe(
      true,
    );
  });

  it('is true for a MODIFY from pending to joined', () => {
    expect(
      isAttendanceJoin(
        change('MODIFY', { status: 'pending' }, { status: 'joined' }),
      ),
    ).toBe(true);
  });

  it('is false for a MODIFY that was already joined', () => {
    expect(
      isAttendanceJoin(
        change('MODIFY', { status: 'joined' }, { status: 'joined' }),
      ),
    ).toBe(false);
  });

  it('is false when the new status is not joined', () => {
    expect(
      isAttendanceJoin(change('INSERT', undefined, { status: 'pending' })),
    ).toBe(false);
    expect(
      isAttendanceJoin(
        change('MODIFY', { status: 'joined' }, { status: 'did_not_attend' }),
      ),
    ).toBe(false);
    expect(isAttendanceJoin(change('REMOVE', { status: 'joined' }))).toBe(false);
  });
});

describe('sessionHours', () => {
  it('rounds partial hours up', () => {
    expect(sessionHours('2026-03-01T10:00:00.000Z', '2026-03-01T11:30:00.000Z')).toBe(
      2,
    );
    expect(sessionHours('2026-03-01T10:00:00.000Z', '2026-03-01T10:01:00.000Z')).toBe(
      1,
    );
  });

  it('keeps whole hours as they are', () => {
    expect(sessionHours('2026-03-01T10:00:00.000Z', '2026-03-01T13:00:00.000Z')).toBe(
      3,
    );
  });

  it('is null when a date cannot be parsed', () => {
    expect(sessionHours('not-a-date', '2026-03-01T11:00:00.000Z')).toBeNull();
    expect(sessionHours('2026-03-01T10:00:00.000Z', 'nope')).toBeNull();
  });

  it('is null when the end is not after the start', () => {
    expect(
      sessionHours('2026-03-01T10:00:00.000Z', '2026-03-01T10:00:00.000Z'),
    ).toBeNull();
    expect(
      sessionHours('2026-03-01T11:00:00.000Z', '2026-03-01T10:00:00.000Z'),
    ).toBeNull();
  });
});

describe('AwardPointsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindActivityType.mockResolvedValue({ subject_type: 'prospect' });
    mockFindConfig.mockResolvedValue({ category: 'prospecting', points: 5 });
    mockAwardOnce.mockResolvedValue(true);
    mockFindGuards.mockResolvedValue([]);
    mockFindSession.mockResolvedValue(null);
  });

  describe('handleProspectChange', () => {
    it('awards the detected activity to the agent with the prospect as subject', async () => {
      await awardPointsService.handleProspectChange(
        change('INSERT', undefined, {
          id: 'p1',
          agent_id: 'agent-1',
          prospect_name: 'Ada',
        }),
      );

      expect(mockFindActivityType).toHaveBeenCalledWith('prospect_created');
      expect(mockFindConfig).toHaveBeenCalledWith('prospect_created');
      expect(mockAwardOnce).toHaveBeenCalledTimes(1);
      expect(mockAwardOnce).toHaveBeenCalledWith({
        user_id: 'agent-1',
        activity: 'prospect_created',
        category: 'prospecting',
        points: 5,
        subject_type: 'prospect',
        subject_id: 'p1',
        subject_label: 'Ada',
      });
    });

    it('awards nothing when no activity is detected', async () => {
      await awardPointsService.handleProspectChange(
        change(
          'MODIFY',
          { id: 'p1', agent_id: 'agent-1' },
          { id: 'p1', agent_id: 'agent-1' },
        ),
      );

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when the row has no agent_id or id', async () => {
      await awardPointsService.handleProspectChange(
        change('INSERT', undefined, { id: 'p1' }),
      );
      await awardPointsService.handleProspectChange(
        change('INSERT', undefined, { agent_id: 'agent-1' }),
      );

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when the activity type is missing', async () => {
      mockFindActivityType.mockResolvedValue(null);

      await awardPointsService.handleProspectChange(
        change('INSERT', undefined, { id: 'p1', agent_id: 'agent-1' }),
      );

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when the point configuration is missing', async () => {
      mockFindConfig.mockResolvedValue(null);

      await awardPointsService.handleProspectChange(
        change('INSERT', undefined, { id: 'p1', agent_id: 'agent-1' }),
      );

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('wraps a repository failure', async () => {
      mockAwardOnce.mockRejectedValue(new Error('boom'));

      await expect(
        awardPointsService.handleProspectChange(
          change('INSERT', undefined, { id: 'p1', agent_id: 'agent-1' }),
        ),
      ).rejects.toThrow();
    });
  });

  describe('deleted-prospect compensation', () => {
    const removal = change('REMOVE', { id: 'p1', agent_id: 'agent-1' });

    it('awards minus the sum of the prospect-subject guards', async () => {
      mockFindGuards.mockResolvedValue([
        { subject_type: 'prospect', points: 10 },
        { subject_type: 'prospect', points: 20 },
        { subject_type: 'coaching', points: 99 },
      ]);

      await awardPointsService.handleProspectChange(removal);

      expect(mockFindGuards).toHaveBeenCalledWith('p1');
      expect(mockAwardOnce).toHaveBeenCalledTimes(1);
      expect(mockAwardOnce).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'agent-1',
          activity: 'prospect_deleted',
          points: -30,
          subject_id: 'p1',
        }),
      );
    });

    it('awards nothing when the guards sum to 0', async () => {
      mockFindGuards.mockResolvedValue([
        { subject_type: 'prospect', points: 0 },
        { subject_type: 'coaching', points: 40 },
      ]);

      await awardPointsService.handleProspectChange(removal);

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when the prospect has no guards', async () => {
      mockFindGuards.mockResolvedValue([]);

      await awardPointsService.handleProspectChange(removal);

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });
  });

  describe('handleAttendanceChange', () => {
    const join = change('INSERT', undefined, {
      id: 'att-1',
      agent_id: 'agent-1',
      session_id: 's1',
      status: 'joined',
    });
    const session = (overrides: Record<string, unknown> = {}) => ({
      id: 's1',
      title: 'Weekly group',
      coaching_type: 'group_coaching',
      start_date: '2026-03-01T10:00:00.000Z',
      end_date: '2026-03-01T11:30:00.000Z',
      ...overrides,
    });

    beforeEach(() => {
      mockFindActivityType.mockResolvedValue({ subject_type: 'coaching' });
      mockFindConfig.mockResolvedValue({ category: 'coaching', points: 4 });
      mockFindSession.mockResolvedValue(session());
    });

    it('awards the mapped activity with points times whole hours', async () => {
      await awardPointsService.handleAttendanceChange(join);

      expect(mockFindSession).toHaveBeenCalledWith('s1');
      expect(mockFindConfig).toHaveBeenCalledWith('coaching_group_attended');
      expect(mockAwardOnce).toHaveBeenCalledTimes(1);
      expect(mockAwardOnce).toHaveBeenCalledWith({
        user_id: 'agent-1',
        activity: 'coaching_group_attended',
        category: 'coaching',
        points: 8,
        subject_type: 'coaching',
        subject_id: 'att-1',
        subject_label: 'Weekly group',
      });
    });

    it.each([
      ['individual_coaching', 'coaching_individual_attended'],
      ['group_coaching', 'coaching_group_attended'],
      ['peer_circles', 'coaching_peer_circles_attended'],
      ['seminar_attended', 'seminar_attended'],
    ])('maps %s to %s', async (coachingType, activity) => {
      mockFindSession.mockResolvedValue(session({ coaching_type: coachingType }));

      await awardPointsService.handleAttendanceChange(join);

      expect(mockFindConfig).toHaveBeenCalledWith(activity);
      expect(mockAwardOnce).toHaveBeenCalledWith(
        expect.objectContaining({ activity }),
      );
    });

    it('awards on a MODIFY from pending to joined', async () => {
      await awardPointsService.handleAttendanceChange(
        change(
          'MODIFY',
          { id: 'att-1', status: 'pending' },
          {
            id: 'att-1',
            agent_id: 'agent-1',
            session_id: 's1',
            status: 'joined',
          },
        ),
      );

      expect(mockAwardOnce).toHaveBeenCalledTimes(1);
    });

    it('awards nothing for an unknown coaching type', async () => {
      mockFindSession.mockResolvedValue(session({ coaching_type: 'webinar' }));

      await awardPointsService.handleAttendanceChange(join);

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when the session end is not after its start', async () => {
      mockFindSession.mockResolvedValue(
        session({ end_date: '2026-03-01T10:00:00.000Z' }),
      );

      await awardPointsService.handleAttendanceChange(join);

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when a session date cannot be parsed', async () => {
      mockFindSession.mockResolvedValue(session({ start_date: 'garbage' }));

      await awardPointsService.handleAttendanceChange(join);

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing when the session is missing', async () => {
      mockFindSession.mockResolvedValue(null);

      await awardPointsService.handleAttendanceChange(join);

      expect(mockAwardOnce).not.toHaveBeenCalled();
    });

    it('awards nothing for a change that is not a join', async () => {
      await awardPointsService.handleAttendanceChange(
        change(
          'MODIFY',
          { id: 'att-1', status: 'joined' },
          {
            id: 'att-1',
            agent_id: 'agent-1',
            session_id: 's1',
            status: 'joined',
          },
        ),
      );
      await awardPointsService.handleAttendanceChange(
        change('INSERT', undefined, {
          id: 'att-1',
          agent_id: 'agent-1',
          session_id: 's1',
          status: 'pending',
        }),
      );

      expect(mockFindSession).not.toHaveBeenCalled();
      expect(mockAwardOnce).not.toHaveBeenCalled();
    });
  });
});
