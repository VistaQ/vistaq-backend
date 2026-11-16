import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRecompute } = vi.hoisted(() => ({ mockRecompute: vi.fn() }));

vi.mock('@src/services/activityStats.service', () => {
  const service = { recompute: mockRecompute };
  return { __esModule: true, default: service, activityStatsService: service };
});

import { handler } from '@src/handlers/statsRecompute';

const message = (
  messageId: string,
  agentId: string,
  prospectIds: string[],
): SQSRecord => ({
  messageId,
  receiptHandle: `handle-${messageId}`,
  body: JSON.stringify({ agent_id: agentId, prospect_ids: prospectIds }),
  attributes: {} as SQSRecord['attributes'],
  messageAttributes: {},
  md5OfBody: '',
  eventSource: 'aws:sqs',
  eventSourceARN: 'arn:aws:sqs:eu-west-1:123456789012:test-stats.fifo',
  awsRegion: 'eu-west-1',
});

const eventOf = (...records: SQSRecord[]): SQSEvent => ({ Records: records });

const sorted = (ids: { itemIdentifier: string }[]): string[] =>
  ids.map((failure) => failure.itemIdentifier).sort();

describe('statsRecompute handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRecompute.mockResolvedValue(undefined);
  });

  it('recomputes each agent once with all of its prospect ids', async () => {
    const result = await handler(
      eventOf(
        message('m1', 'a1', ['p1']),
        message('m2', 'a2', ['p2']),
        message('m3', 'a1', ['p3', 'p4']),
      ),
    );

    expect(mockRecompute).toHaveBeenCalledTimes(2);
    expect(mockRecompute).toHaveBeenCalledWith('a1', ['p1', 'p3', 'p4']);
    expect(mockRecompute).toHaveBeenCalledWith('a2', ['p2']);
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('treats a message without prospect ids as an empty list', async () => {
    const record = message('m1', 'a1', []);
    record.body = JSON.stringify({ agent_id: 'a1' });

    await handler(eventOf(record));

    expect(mockRecompute).toHaveBeenCalledWith('a1', []);
  });

  it('reports all of a failing agent messages and none of another agent', async () => {
    mockRecompute.mockImplementation(async (agentId: string) => {
      if (agentId === 'a1') throw new Error('boom');
    });

    const result = await handler(
      eventOf(
        message('m1', 'a1', ['p1']),
        message('m2', 'a2', ['p2']),
        message('m3', 'a1', ['p3']),
        message('m4', 'a1', ['p4']),
      ),
    );

    expect(mockRecompute).toHaveBeenCalledTimes(2);
    expect(sorted(result.batchItemFailures)).toEqual(['m1', 'm3', 'm4']);
  });

  it('reports a malformed message on its own and still recomputes the others', async () => {
    const malformed = message('m2', 'a1', []);
    malformed.body = 'not json';

    const result = await handler(
      eventOf(message('m1', 'a1', ['p1']), malformed, message('m3', 'a2', ['p3'])),
    );

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'm2' }] });
    expect(mockRecompute).toHaveBeenCalledTimes(2);
    expect(mockRecompute).toHaveBeenCalledWith('a1', ['p1']);
    expect(mockRecompute).toHaveBeenCalledWith('a2', ['p3']);
  });
});
