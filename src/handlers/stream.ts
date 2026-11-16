import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBRecord } from 'aws-lambda';

import type { TableName } from '@src/constants/tables';
import type { IStreamChange } from '@src/types/stream.types';
import EnvVars from '@src/utils/env';

type IImageAttributes = Record<string, AttributeValue>;

/** The base table name from a stream record's source ARN, without the stage prefix. */
export function tableOf(record: DynamoDBRecord): TableName | null {
  const table = record.eventSourceARN?.match(/:table\/([^/]+)\/stream\//)?.[1];
  if (!table?.startsWith(EnvVars.TablePrefix)) return null;
  return table.slice(EnvVars.TablePrefix.length) as TableName;
}

export function changeOf(record: DynamoDBRecord): IStreamChange {
  const images = record.dynamodb ?? {};
  return {
    eventName: record.eventName ?? 'MODIFY',
    oldImage: images.OldImage
      ? unmarshall(images.OldImage as IImageAttributes)
      : undefined,
    newImage: images.NewImage
      ? unmarshall(images.NewImage as IImageAttributes)
      : undefined,
  };
}
