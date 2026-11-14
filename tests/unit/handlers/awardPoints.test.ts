import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHandleProspect, mockHandleAttendance } = vi.hoisted(() => ({
  mockHandleProspect: vi.fn(),
  mockHandleAttendance: vi.fn(),
}));

vi.mock('@src/services/awardPoints.service', () => {
  const service = {
    handleProspectChange: mockHandleProspect,
    handleAttendanceChange: mockHandleAttendance,
  };
  return { __esModule: true, default: service, awardPointsService: service };
});

import { handler } from '@src/handlers/awardPoints';

const arnOf = (table: string): string =>
  `arn:aws:dynamodb:eu-west-1:123456789012:table/${table}/stream/2026-03-01T00:00:00.000`;

const record = (
  table: string,
  sequenceNumber: string,
  eventName: 'INSERT' | 'MODIFY' | 'REMOVE' = 'INSERT',
): DynamoDBRecord => ({
  eventName,
  eventSourceARN: arnOf(table),
  dynamodb: {
    SequenceNumber: sequenceNumber,
    NewImage: { id: { S: `id-${sequenceNumber}` } },
  },
});

const eventOf = (...records: DynamoDBRecord[]): DynamoDBStreamEvent => ({
  Records: records,
});

describe('awardPoints stream handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleProspect.mockResolvedValue(undefined);
    mockHandleAttendance.mockResolvedValue(undefined);
  });

  it('routes Prospects records to handleProspectChange with the decoded change', async () => {
    await handler(eventOf(record('test_vistaq_Prospects', '1')));

    expect(mockHandleProspect).toHaveBeenCalledTimes(1);
    expect(mockHandleProspect).toHaveBeenCalledWith({
      eventName: 'INSERT',
      oldImage: undefined,
      newImage: { id: 'id-1' },
    });
    expect(mockHandleAttendance).not.toHaveBeenCalled();
  });

  it('routes CoachingAttendance records to handleAttendanceChange', async () => {
    await handler(eventOf(record('test_vistaq_CoachingAttendance', '1')));

    expect(mockHandleAttendance).toHaveBeenCalledTimes(1);
    expect(mockHandleAttendance).toHaveBeenCalledWith({
      eventName: 'INSERT',
      oldImage: undefined,
      newImage: { id: 'id-1' },
    });
    expect(mockHandleProspect).not.toHaveBeenCalled();
  });

  it('ignores records from other tables and from other stage prefixes', async () => {
    const result = await handler(
      eventOf(
        record('test_vistaq_Users', '1'),
        record('prod_vistaq_Prospects', '2'),
      ),
    );

    expect(mockHandleProspect).not.toHaveBeenCalled();
    expect(mockHandleAttendance).not.toHaveBeenCalled();
    expect(result).toEqual({ batchItemFailures: [] });
  });

  it('returns no failures for a clean batch and processes every record in order', async () => {
    const result = await handler(
      eventOf(
        record('test_vistaq_Prospects', '1'),
        record('test_vistaq_CoachingAttendance', '2'),
        record('test_vistaq_Prospects', '3', 'REMOVE'),
      ),
    );

    expect(result).toEqual({ batchItemFailures: [] });
    expect(mockHandleProspect).toHaveBeenCalledTimes(2);
    expect(mockHandleAttendance).toHaveBeenCalledTimes(1);
  });

  it('stops at the first failing record and reports only its SequenceNumber', async () => {
    mockHandleProspect.mockImplementation(async (change: { newImage?: { id?: string } }) => {
      if (change.newImage?.id === 'id-2') throw new Error('boom');
    });

    const result = await handler(
      eventOf(
        record('test_vistaq_Prospects', '1'),
        record('test_vistaq_Prospects', '2'),
        record('test_vistaq_Prospects', '3'),
        record('test_vistaq_CoachingAttendance', '4'),
      ),
    );

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: '2' }] });
    expect(mockHandleProspect).toHaveBeenCalledTimes(2);
    expect(mockHandleAttendance).not.toHaveBeenCalled();
  });

  it('reports an attendance failure the same way', async () => {
    mockHandleAttendance.mockRejectedValue(new Error('boom'));

    const result = await handler(
      eventOf(
        record('test_vistaq_CoachingAttendance', '7'),
        record('test_vistaq_Prospects', '8'),
      ),
    );

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: '7' }] });
    expect(mockHandleProspect).not.toHaveBeenCalled();
  });
});
