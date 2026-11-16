import type {
  SQSBatchItemFailure,
  SQSBatchResponse,
  SQSEvent,
} from 'aws-lambda';

import activityStatsService, {
  type IRecomputeMessage,
} from '@src/services/activityStats.service';

// Messages are grouped by agent so each agent recomputes once per batch. When
// an agent fails, all of its messages are reported so the FIFO group keeps its
// order on the retry; other agents are unaffected.
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const byAgent = new Map<
    string,
    { messageIds: string[]; prospectIds: string[] }
  >();
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body) as IRecomputeMessage;
      const entry = byAgent.get(body.agent_id) ?? {
        messageIds: [],
        prospectIds: [],
      };
      entry.messageIds.push(record.messageId);
      entry.prospectIds.push(...(body.prospect_ids ?? []));
      byAgent.set(body.agent_id, entry);
    } catch {
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  await Promise.all(
    Array.from(byAgent.entries()).map(async ([agentId, entry]) => {
      try {
        await activityStatsService.recompute(agentId, entry.prospectIds);
      } catch {
        batchItemFailures.push(
          ...entry.messageIds.map((itemIdentifier) => ({ itemIdentifier })),
        );
      }
    }),
  );
  return { batchItemFailures };
}
