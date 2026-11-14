import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindByAgentIds, mockFindById, mockFindSince, mockReplaceForUser, mockSendFifo } =
  vi.hoisted(() => ({
    mockFindByAgentIds: vi.fn(),
    mockFindById: vi.fn(),
    mockFindSince: vi.fn(),
    mockReplaceForUser: vi.fn(),
    mockSendFifo: vi.fn(),
  }));

vi.mock('@src/repositories/prospect.repository', () => ({
  __esModule: true,
  default: { findByAgentIds: mockFindByAgentIds, findById: mockFindById },
}));

vi.mock('@src/repositories/userStats.repository', () => ({
  __esModule: true,
  default: { findSince: mockFindSince, replaceForUser: mockReplaceForUser },
}));

vi.mock('@src/services/sqs.service', () => ({
  __esModule: true,
  default: { sendFifo: mockSendFifo },
}));

import activityStatsService, {
  computeBuckets,
} from '@src/services/activityStats.service';
import type { IFifoMessage } from '@src/services/sqs.service';
import type { IProspect } from '@src/types/auth.types';
import type { IStreamChange } from '@src/types/stream.types';
import type { IUserStats } from '@src/types/userStats.types';

const prospect = (overrides: Partial<IProspect> = {}): IProspect => ({
  id: 'p1',
  agent_id: 'a1',
  prospect_name: 'Ann',
  prospect_email: null,
  prospect_phone: null,
  current_stage: 'prospect',
  prospect_entered_at: '2026-03-10T09:00:00.000Z',
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
  created_at: '2026-03-10T09:00:00.000Z',
  updated_at: '2026-03-10T09:00:00.000Z',
  ...overrides,
});

const stats = (ym: number, overrides: Partial<IUserStats> = {}): IUserStats => ({
  user_id: 'a1',
  ym,
  prospects: 0,
  appointments_set: 0,
  appt_done: 0,
  stage_sales: 0,
  sales_noc: 0,
  sales_ace: 0,
  ...overrides,
});

const byMonth = (rows: IUserStats[]): IUserStats[] =>
  [...rows].sort((a, b) => a.ym - b.ym);

const sentMessages = (): IFifoMessage[] => mockSendFifo.mock.calls[0][1];

describe('computeBuckets', () => {
  it('counts a prospect in the month it was created', () => {
    const result = computeBuckets('a1', [
      prospect({ id: 'p1', created_at: '2026-03-02T10:00:00.000Z' }),
      prospect({ id: 'p2', created_at: '2026-03-28T10:00:00.000Z' }),
    ]);

    expect(result).toEqual([stats(202603, { prospects: 2 })]);
  });

  it('counts appointments set in the appointment month for scheduled, rescheduled and done only', () => {
    const inApril = {
      created_at: '2026-03-02T10:00:00.000Z',
      appointment_date: '2026-04-15T10:00:00.000Z',
    };
    const result = computeBuckets('a1', [
      prospect({ id: 'p1', appointment_status: 'scheduled', ...inApril }),
      prospect({ id: 'p2', appointment_status: 'rescheduled', ...inApril }),
      prospect({ id: 'p3', appointment_status: 'done', ...inApril }),
      prospect({ id: 'p4', appointment_status: 'cancelled', ...inApril }),
      prospect({ id: 'p5', appointment_status: null, ...inApril }),
    ]);

    const april = byMonth(result).find((row) => row.ym === 202604);
    expect(april?.appointments_set).toBe(3);
  });

  it('does not count an appointment set when the appointment has no date', () => {
    const result = computeBuckets('a1', [
      prospect({ appointment_status: 'scheduled', appointment_date: null }),
    ]);

    expect(result).toEqual([stats(202603, { prospects: 1 })]);
  });

  it('counts appt_done and stage_sales in the appointment_completed_at month', () => {
    const result = computeBuckets('a1', [
      prospect({
        appointment_status: 'done',
        current_stage: 'sales',
        appointment_date: '2026-03-12T10:00:00.000Z',
        appointment_completed_at: '2026-04-03T10:00:00.000Z',
        updated_at: '2026-05-20T10:00:00.000Z',
      }),
    ]);

    expect(byMonth(result)).toEqual([
      stats(202603, { prospects: 1, appointments_set: 1 }),
      stats(202604, { appt_done: 1, stage_sales: 1 }),
    ]);
  });

  it('falls back to updated_at when appointment_completed_at is missing', () => {
    const result = computeBuckets('a1', [
      prospect({
        appointment_status: 'done',
        current_stage: 'sales',
        appointment_date: '2026-03-12T10:00:00.000Z',
        appointment_completed_at: null,
        updated_at: '2026-05-20T10:00:00.000Z',
      }),
    ]);

    expect(byMonth(result)).toEqual([
      stats(202603, { prospects: 1, appointments_set: 1 }),
      stats(202605, { appt_done: 1, stage_sales: 1 }),
    ]);
  });

  it('counts stage_sales without appt_done for a prospect in the sales stage whose appointment is not done', () => {
    const result = computeBuckets('a1', [
      prospect({ current_stage: 'sales', appointment_status: 'scheduled' }),
    ]);

    expect(result[0]).toMatchObject({ stage_sales: 1, appt_done: 0 });
  });

  it('counts sales_noc and sums products_sold into sales_ace in the sales_completed_at month', () => {
    const result = computeBuckets('a1', [
      prospect({
        sales_outcome: 'successful',
        sales_completed_at: '2026-06-09T10:00:00.000Z',
        updated_at: '2026-07-01T10:00:00.000Z',
        products_sold: [
          { productName: 'Plan A', amount: 1200 },
          { productName: 'Plan B', amount: 300.5 },
        ],
      }),
    ]);

    expect(byMonth(result)).toEqual([
      stats(202603, { prospects: 1 }),
      stats(202606, { sales_noc: 1, sales_ace: 1500.5 }),
    ]);
  });

  it('falls back to updated_at for the sale month and treats missing products as zero ACE', () => {
    const result = computeBuckets('a1', [
      prospect({
        sales_outcome: 'successful',
        sales_completed_at: null,
        updated_at: '2026-07-01T10:00:00.000Z',
        products_sold: null,
      }),
    ]);

    expect(byMonth(result)).toEqual([
      stats(202603, { prospects: 1 }),
      stats(202607, { sales_noc: 1, sales_ace: 0 }),
    ]);
  });

  it('ignores sales that are not successful', () => {
    const result = computeBuckets('a1', [
      prospect({
        sales_outcome: 'unsuccessful',
        sales_completed_at: '2026-06-09T10:00:00.000Z',
        products_sold: [{ productName: 'Plan A', amount: 900 }],
      }),
    ]);

    expect(result).toEqual([stats(202603, { prospects: 1 })]);
  });

  it('keeps prospects in different months in separate buckets', () => {
    const result = computeBuckets('a1', [
      prospect({ id: 'p1', created_at: '2026-01-15T10:00:00.000Z' }),
      prospect({ id: 'p2', created_at: '2026-02-15T10:00:00.000Z' }),
      prospect({ id: 'p3', created_at: '2026-02-20T10:00:00.000Z' }),
      prospect({ id: 'p4', created_at: '2025-12-31T10:00:00.000Z' }),
    ]);

    expect(byMonth(result)).toEqual([
      stats(202512, { prospects: 1 }),
      stats(202601, { prospects: 1 }),
      stats(202602, { prospects: 2 }),
    ]);
  });

  it('counts a prospect created at 23:30 UTC on the last day of a month in that month', () => {
    const result = computeBuckets('a1', [
      prospect({
        created_at: '2026-01-31T23:30:00.000Z',
        updated_at: '2026-01-31T23:30:00.000Z',
      }),
    ]);

    expect(result).toEqual([stats(202601, { prospects: 1 })]);
  });

  it('returns no buckets when the agent has no prospects', () => {
    expect(computeBuckets('a1', [])).toEqual([]);
  });
});

describe('ActivityStatsService.enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendFifo.mockResolvedValue(undefined);
  });

  const change = (
    overrides: Partial<IStreamChange> & Pick<IStreamChange, 'eventName'>,
  ): IStreamChange => overrides;

  it('sends one FIFO message for the agent of an inserted prospect', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({
          eventName: 'INSERT',
          newImage: { id: 'p1', agent_id: 'a1' },
        }),
      },
    ]);

    expect(mockSendFifo).toHaveBeenCalledTimes(1);
    expect(sentMessages()).toHaveLength(1);
    expect(sentMessages()[0].body).toEqual({
      agent_id: 'a1',
      prospect_ids: ['p1'],
    });
  });

  it('sends one message for a removed prospect, using its old image', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({
          eventName: 'REMOVE',
          oldImage: { id: 'p1', agent_id: 'a1' },
        }),
      },
    ]);

    expect(sentMessages()).toHaveLength(1);
    expect(sentMessages()[0].body).toEqual({
      agent_id: 'a1',
      prospect_ids: ['p1'],
    });
  });

  it('sends a single message when a modify keeps the same agent', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({
          eventName: 'MODIFY',
          oldImage: { id: 'p1', agent_id: 'a1' },
          newImage: { id: 'p1', agent_id: 'a1' },
        }),
      },
    ]);

    expect(sentMessages()).toHaveLength(1);
  });

  it('sends a message to each agent when a modify moves a prospect between agents', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({
          eventName: 'MODIFY',
          oldImage: { id: 'p1', agent_id: 'a1' },
          newImage: { id: 'p1', agent_id: 'a2' },
        }),
      },
    ]);

    expect(sentMessages().map((message) => message.body)).toEqual([
      { agent_id: 'a1', prospect_ids: ['p1'] },
      { agent_id: 'a2', prospect_ids: ['p1'] },
    ]);
  });

  it('uses the agent id as the group id so each agent recomputes in order', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({
          eventName: 'INSERT',
          newImage: { id: 'p1', agent_id: 'a1' },
        }),
      },
      {
        eventId: 'e2',
        change: change({
          eventName: 'MODIFY',
          oldImage: { id: 'p2', agent_id: 'a1' },
          newImage: { id: 'p2', agent_id: 'a2' },
        }),
      },
    ]);

    expect(
      sentMessages().map((message) => [message.groupId, message.body]),
    ).toEqual([
      ['a1', { agent_id: 'a1', prospect_ids: ['p1'] }],
      ['a1', { agent_id: 'a1', prospect_ids: ['p2'] }],
      ['a2', { agent_id: 'a2', prospect_ids: ['p2'] }],
    ]);
  });

  it('builds the deduplication id from the event id and agent id', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e7',
        change: change({
          eventName: 'MODIFY',
          oldImage: { id: 'p1', agent_id: 'a1' },
          newImage: { id: 'p1', agent_id: 'a2' },
        }),
      },
    ]);

    expect(sentMessages().map((message) => message.deduplicationId)).toEqual([
      'e7:a1',
      'e7:a2',
    ]);
  });

  it('produces the same deduplication ids when the same batch is retried', async () => {
    const batch = [
      {
        eventId: 'e1',
        change: change({
          eventName: 'INSERT' as const,
          newImage: { id: 'p1', agent_id: 'a1' },
        }),
      },
      {
        eventId: 'e2',
        change: change({
          eventName: 'INSERT' as const,
          newImage: { id: 'p2', agent_id: 'a1' },
        }),
      },
    ];

    await activityStatsService.enqueue(batch);
    await activityStatsService.enqueue(batch);

    const dedupeIds = (call: number): string[] =>
      (mockSendFifo.mock.calls[call][1] as IFifoMessage[]).map(
        (message) => message.deduplicationId,
      );
    expect(dedupeIds(1)).toEqual(dedupeIds(0));
    expect(new Set(dedupeIds(0)).size).toBe(2);
  });

  it('gives every message in a batch a distinct id', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({
          eventName: 'MODIFY',
          oldImage: { id: 'p1', agent_id: 'a1' },
          newImage: { id: 'p1', agent_id: 'a2' },
        }),
      },
      {
        eventId: 'e2',
        change: change({
          eventName: 'INSERT',
          newImage: { id: 'p2', agent_id: 'a1' },
        }),
      },
    ]);

    const ids = sentMessages().map((message) => message.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('sends nothing when no change carries an agent', async () => {
    await activityStatsService.enqueue([
      {
        eventId: 'e1',
        change: change({ eventName: 'INSERT', newImage: { id: 'p1' } }),
      },
      {
        eventId: 'e2',
        change: change({
          eventName: 'MODIFY',
          oldImage: { id: 'p2', agent_id: 42 },
          newImage: { id: 'p2', agent_id: null },
        }),
      },
      { eventId: 'e3', change: change({ eventName: 'REMOVE' }) },
    ]);

    expect(mockSendFifo).not.toHaveBeenCalled();
  });
});

describe('ActivityStatsService.recompute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindByAgentIds.mockResolvedValue([]);
    mockFindById.mockResolvedValue(null);
    mockFindSince.mockResolvedValue([]);
    mockReplaceForUser.mockResolvedValue(undefined);
  });

  it('writes the buckets computed from the agent prospects', async () => {
    mockFindByAgentIds.mockResolvedValue([
      prospect({ id: 'p1', created_at: '2026-03-02T10:00:00.000Z' }),
      prospect({ id: 'p2', created_at: '2026-04-02T10:00:00.000Z' }),
    ]);

    await activityStatsService.recompute('a1', []);

    expect(mockFindByAgentIds).toHaveBeenCalledWith(['a1']);
    expect(mockReplaceForUser).toHaveBeenCalledTimes(1);
    const [userId, rows, stale] = mockReplaceForUser.mock.calls[0];
    expect(userId).toBe('a1');
    expect(byMonth(rows)).toEqual([
      stats(202603, { prospects: 1 }),
      stats(202604, { prospects: 1 }),
    ]);
    expect(stale).toEqual([]);
  });

  it('re-reads a changed prospect with a consistent read and prefers it over the index copy', async () => {
    mockFindByAgentIds.mockResolvedValue([
      prospect({
        id: 'p1',
        appointment_status: 'scheduled',
        appointment_date: '2026-03-20T10:00:00.000Z',
      }),
    ]);
    mockFindById.mockResolvedValue(
      prospect({
        id: 'p1',
        appointment_status: 'scheduled',
        appointment_date: '2026-04-20T10:00:00.000Z',
      }),
    );

    await activityStatsService.recompute('a1', ['p1']);

    expect(mockFindById).toHaveBeenCalledWith('p1', { consistent: true });
    const rows = mockReplaceForUser.mock.calls[0][1] as IUserStats[];
    expect(byMonth(rows)).toEqual([
      stats(202603, { prospects: 1 }),
      stats(202604, { appointments_set: 1 }),
    ]);
  });

  it('includes a changed prospect the index does not show yet', async () => {
    mockFindByAgentIds.mockResolvedValue([]);
    mockFindById.mockResolvedValue(prospect({ id: 'p9' }));

    await activityStatsService.recompute('a1', ['p9']);

    expect(mockReplaceForUser.mock.calls[0][1]).toEqual([
      stats(202603, { prospects: 1 }),
    ]);
  });

  it('drops a changed prospect that is now owned by another agent', async () => {
    mockFindByAgentIds.mockResolvedValue([
      prospect({ id: 'p1', created_at: '2026-03-02T10:00:00.000Z' }),
      prospect({ id: 'p2', created_at: '2026-04-02T10:00:00.000Z' }),
    ]);
    mockFindById.mockResolvedValue(prospect({ id: 'p1', agent_id: 'a2' }));

    await activityStatsService.recompute('a1', ['p1']);

    expect(mockReplaceForUser.mock.calls[0][1]).toEqual([
      stats(202604, { prospects: 1 }),
    ]);
  });

  it('drops a changed prospect that was deleted', async () => {
    mockFindByAgentIds.mockResolvedValue([
      prospect({ id: 'p1', created_at: '2026-03-02T10:00:00.000Z' }),
      prospect({ id: 'p2', created_at: '2026-04-02T10:00:00.000Z' }),
    ]);
    mockFindById.mockResolvedValue(null);

    await activityStatsService.recompute('a1', ['p2']);

    expect(mockReplaceForUser.mock.calls[0][1]).toEqual([
      stats(202603, { prospects: 1 }),
    ]);
  });

  it('reads each changed prospect once even when its id repeats', async () => {
    await activityStatsService.recompute('a1', ['p1', 'p1', 'p2']);

    expect(mockFindById).toHaveBeenCalledTimes(2);
  });

  it('passes months that had stats but no longer have prospects as stale', async () => {
    mockFindByAgentIds.mockResolvedValue([
      prospect({ id: 'p2', created_at: '2026-04-02T10:00:00.000Z' }),
    ]);
    mockFindSince.mockResolvedValue([
      stats(202602, { prospects: 1 }),
      stats(202603, { prospects: 1 }),
      stats(202604, { prospects: 1 }),
    ]);

    await activityStatsService.recompute('a1', []);

    expect(mockFindSince).toHaveBeenCalledWith(['a1'], 1);
    const [, rows, stale] = mockReplaceForUser.mock.calls[0];
    expect(rows).toEqual([stats(202604, { prospects: 1 })]);
    expect([...stale].sort()).toEqual([202602, 202603]);
  });

  it('clears every existing month when the agent has no prospects left', async () => {
    mockFindSince.mockResolvedValue([stats(202603, { prospects: 1 })]);

    await activityStatsService.recompute('a1', ['p1']);

    expect(mockReplaceForUser).toHaveBeenCalledWith('a1', [], [202603]);
  });

  it('writes identical counters when run twice with the same data', async () => {
    const sold = prospect({
      id: 'p1',
      appointment_status: 'done',
      appointment_date: '2026-03-12T10:00:00.000Z',
      appointment_completed_at: '2026-03-12T11:00:00.000Z',
      sales_outcome: 'successful',
      sales_completed_at: '2026-04-01T10:00:00.000Z',
      products_sold: [{ productName: 'Plan A', amount: 800 }],
    });
    mockFindByAgentIds.mockResolvedValue([sold]);
    mockFindById.mockResolvedValue(sold);
    mockFindSince.mockResolvedValue([stats(202601, { prospects: 1 })]);

    await activityStatsService.recompute('a1', ['p1']);
    await activityStatsService.recompute('a1', ['p1']);

    expect(mockReplaceForUser).toHaveBeenCalledTimes(2);
    expect(mockReplaceForUser.mock.calls[0][1]).toEqual([
      stats(202603, { prospects: 1, appointments_set: 1, appt_done: 1 }),
      stats(202604, { sales_noc: 1, sales_ace: 800 }),
    ]);
    expect(mockReplaceForUser.mock.calls[1]).toEqual(
      mockReplaceForUser.mock.calls[0],
    );
  });
});
