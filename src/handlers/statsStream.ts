import type { DynamoDBBatchResponse, DynamoDBStreamEvent } from 'aws-lambda';

import { changeOf } from '@src/handlers/stream';
import activityStatsService from '@src/services/activityStats.service';

export async function handler(
  event: DynamoDBStreamEvent,
): Promise<DynamoDBBatchResponse> {
  try {
    await activityStatsService.enqueue(
      event.Records.map((record) => ({
        eventId: record.eventID ?? '',
        change: changeOf(record),
      })),
    );
    return { batchItemFailures: [] };
  } catch {
    // Queueing is all or nothing per batch; FIFO deduplication drops the
    // messages that did get through when the batch is retried.
    return {
      batchItemFailures: [
        { itemIdentifier: event.Records[0]?.dynamodb?.SequenceNumber ?? '' },
      ],
    };
  }
}
