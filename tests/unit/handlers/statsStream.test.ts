import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockEnqueue } = vi.hoisted(() => ({ mockEnqueue: vi.fn() }));

vi.mock('@src/services/activityStats.service', () => {
  const service = { enqueue: mockEnqueue };
  return { __esModule: true, default: service, activityStatsService: service };
});

import { handler } from '@src/handlers/statsStream';

const record = (
  eventId: string,
  sequenceNumber: string,
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE',
  images: {
    oldImage?: Record<string, { S: string }>;
    newImage?: Record<string, { S: string }>;
  },
): DynamoDBRecord => ({
  eventID: eventId,
  eventName,
  eventSourceARN:
    'arn:aws:dynamodb:eu-west-1:123456789012:table/test_vistaq_Prospects/stream/2026-03-01T00:00:00.000',
  dynamodb: {
    SequenceNumber: sequenceNumber,
    OldImage: images.oldImage,
    NewImage: images.newImage,
  },
});

const eventOf = (...records: DynamoDBRecord[]): DynamoDBStreamEvent => ({
  Records: records,
});

describe('statsStream handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('enqueues every record with its event id and decoded change and reports no failures', async () => {
    const result = await handler(
      eventOf(
        record('e1', '1', 'INSERT', {
          newImage: { id: { S: 'p1' }, agent_id: { S: 'a1' } },
        }),
        record('e2', '2', 'MODIFY', {
          oldImage: { id: { S: 'p1' }, agent_id: { S: 'a1' } },
          newImage: { id: { S: 'p1' }, agent_id: { S: 'a2' } },
        }),
        record('e3', '3', 'REMOVE', {
          oldImage: { id: { S: 'p2' }, agent_id: { S: 'a1' } },
        }),
      ),
    );

    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith([
      {
        eventId: 'e1',
        change: {
          eventName: 'INSERT',
          oldImage: undefined,
          newImage: { id: 'p1', agent_id: 'a1' },
        },
      },
      {
        eventId: 'e2',
        change: {
          eventName: 'MODIFY',
          oldImage: { id: 'p1', agent_id: 'a1' },
          newImage: { id: 'p1', agent_id: 'a2' },
        },
      },
      {
        eventId: 'e3',
        change: {
          eventName: 'REMOVE',
          oldImage: { id: 'p2', agent_id: 'a1' },
          newImage: undefined,
        },
      },
    ]);
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('reports the first record SequenceNumber when enqueue throws so the whole batch is retried', async () => {
    mockEnqueue.mockRejectedValue(new Error('boom'));

    const result = await handler(
      eventOf(
        record('e1', '11', 'INSERT', { newImage: { id: { S: 'p1' } } }),
        record('e2', '12', 'INSERT', { newImage: { id: { S: 'p2' } } }),
        record('e3', '13', 'INSERT', { newImage: { id: { S: 'p3' } } }),
      ),
    );

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: '11' }] });
  });
});
