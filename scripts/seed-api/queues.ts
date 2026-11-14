import { GetQueueAttributesCommand, type SQSClient } from '@aws-sdk/client-sqs';

import type { IStage } from './stage';

// Nothing reads these; each message is a stream or stats record that failed.
export const FAILURE_QUEUES = [
  'AwardPointsFailureQueue',
  'StatsStreamFailureQueue',
  'StatsDeadLetterQueue',
] as const;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function queueDepth(sqs: SQSClient, url: string): Promise<number> {
  const { Attributes = {} } = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: url,
      AttributeNames: [
        'ApproximateNumberOfMessages',
        'ApproximateNumberOfMessagesNotVisible',
        'ApproximateNumberOfMessagesDelayed',
      ],
    }),
  );
  return Object.values(Attributes).reduce(
    (total, value) => total + Number(value ?? 0),
    0,
  );
}

export async function failureDepths(
  stage: IStage,
  sqs: SQSClient,
): Promise<Record<string, number>> {
  const depths: Record<string, number> = {};
  for (const name of FAILURE_QUEUES) {
    const url = stage.queues[name];
    if (url) depths[name] = await queueDepth(sqs, url);
  }
  return depths;
}

export function describeGrowth(
  before: Record<string, number>,
  after: Record<string, number>,
): string[] {
  return Object.entries(after)
    .filter(([name, depth]) => depth > (before[name] ?? 0))
    .map(
      ([name, depth]) =>
        `${name} grew from ${before[name] ?? 0} to ${depth} messages`,
    );
}

export async function waitForEmptyQueue(
  sqs: SQSClient,
  url: string,
  { pollMs = 5_000, timeoutMs = 600_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while ((await queueDepth(sqs, url)) > 0) {
    if (Date.now() > deadline) {
      throw new Error(`${url} still has messages after ${timeoutMs / 1000}s`);
    }
    await wait(pollMs);
  }
}
