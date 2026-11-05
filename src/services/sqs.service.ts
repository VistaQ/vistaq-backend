import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';

import { SqsServiceError } from '@src/models/errors/sqs.error';

export interface IFifoMessage {
  id: string;
  groupId: string;
  deduplicationId: string;
  body: unknown;
}

const BATCH_LIMIT = 10;

const client = new SQSClient({});

/******************************************************************************
                              SqsService
******************************************************************************/

class SqsService {
  async sendFifo(queueUrl: string, messages: IFifoMessage[]): Promise<void> {
    try {
      if (!queueUrl) {
        throw new Error('STATS_QUEUE_URL is not set');
      }
      for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
        const result = await client.send(
          new SendMessageBatchCommand({
            QueueUrl: queueUrl,
            Entries: messages.slice(i, i + BATCH_LIMIT).map((message) => ({
              Id: message.id,
              MessageGroupId: message.groupId,
              MessageDeduplicationId: message.deduplicationId,
              MessageBody: JSON.stringify(message.body),
            })),
          }),
        );
        if (result.Failed?.length) {
          throw new Error(`${result.Failed.length} messages were not queued`);
        }
      }
    } catch (error) {
      throw new SqsServiceError('SqsService.sendFifo failed', error);
    }
  }
}

export const sqsService = new SqsService();
export default sqsService;
