import type {
  DynamoDBBatchItemFailure,
  DynamoDBBatchResponse,
  DynamoDBStreamEvent,
} from 'aws-lambda';

import { changeOf, tableOf } from '@src/handlers/stream';
import awardPointsService from '@src/services/awardPoints.service';

// Records run in shard order and the first failure stops the batch: Lambda
// retries from that record (ReportBatchItemFailures), and the award guards make
// the already-processed ones award nothing on the retry.
export async function handler(
  event: DynamoDBStreamEvent,
): Promise<DynamoDBBatchResponse> {
  const batchItemFailures: DynamoDBBatchItemFailure[] = [];
  for (const record of event.Records) {
    try {
      const table = tableOf(record);
      if (table === 'Prospects') {
        await awardPointsService.handleProspectChange(changeOf(record));
      } else if (table === 'CoachingAttendance') {
        await awardPointsService.handleAttendanceChange(changeOf(record));
      }
    } catch {
      batchItemFailures.push({
        itemIdentifier: record.dynamodb?.SequenceNumber ?? '',
      });
      break;
    }
  }
  return { batchItemFailures };
}
