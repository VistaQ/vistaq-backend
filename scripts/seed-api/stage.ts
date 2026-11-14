import {
  CloudFormationClient,
  DescribeStacksCommand,
  paginateListStackResources,
} from '@aws-sdk/client-cloudformation';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { join } from 'path';

import { TABLE_NAMES, type TableName } from '@src/constants/tables';

export interface IStage {
  name: string;
  region: string;
  apiUrl: string;
  userPoolId: string;
  clientId: string;
  tablePrefix: string;
  tables: Record<TableName, string>;
}

export class StageError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'StageError';
  }
}

interface IServerlessConfig {
  service: string;
  provider: { region: string };
}

const config = load(
  readFileSync(join(__dirname, '../../serverless.yml'), 'utf8'),
) as IServerlessConfig;

export const SERVICE = config.service;
export const REGION = config.provider.region;

export function stageFromArgs(argv: readonly string[]): string {
  const index = argv.indexOf('--stage');
  const stage = index >= 0 ? argv[index + 1] : undefined;
  if (!stage || stage.startsWith('--')) {
    throw new StageError('Missing --stage <stage>, for example --stage staging');
  }
  if (stage === 'production') {
    throw new StageError('Refusing to run against production');
  }
  return stage;
}

export async function resolveStage(
  name: string,
  cloudFormation = new CloudFormationClient({ region: REGION }),
): Promise<IStage> {
  if (name === 'production') {
    throw new StageError('Refusing to run against production');
  }
  const stackName = `${SERVICE}-${name}`;

  const { Stacks } = await cloudFormation.send(
    new DescribeStacksCommand({ StackName: stackName }),
  );
  const outputs = new Map(
    (Stacks?.[0]?.Outputs ?? []).map((o) => [o.OutputKey, o.OutputValue]),
  );
  const output = (key: string): string => {
    const value = outputs.get(key);
    if (!value) throw new StageError(`${stackName} has no ${key} output`);
    return value;
  };

  const tables: Partial<Record<TableName, string>> = {};
  const prefixes = new Set<string>();
  for await (const page of paginateListStackResources(
    { client: cloudFormation },
    { StackName: stackName },
  )) {
    for (const resource of page.StackResourceSummaries ?? []) {
      if (resource.ResourceType !== 'AWS::DynamoDB::Table') continue;
      const base = resource.LogicalResourceId?.replace(/Table$/, '');
      const physical = resource.PhysicalResourceId;
      if (!base || !physical || !TABLE_NAMES.includes(base as TableName)) {
        continue;
      }
      if (!physical.endsWith(base)) {
        throw new StageError(`${physical} does not end with ${base}`);
      }
      tables[base as TableName] = physical;
      prefixes.add(physical.slice(0, physical.length - base.length));
    }
  }

  const missing = TABLE_NAMES.filter((base) => !tables[base]);
  if (missing.length) {
    throw new StageError(`${stackName} has no table for ${missing.join(', ')}`);
  }
  if (prefixes.size !== 1) {
    throw new StageError(
      `${stackName} tables do not share one prefix: ${[...prefixes].join(', ')}`,
    );
  }
  const [tablePrefix] = prefixes;
  if (tablePrefix.startsWith('prod_')) {
    throw new StageError(`Refusing to run against ${tablePrefix} tables`);
  }

  return {
    name,
    region: REGION,
    apiUrl: `${output('HttpApiUrl')}/api`,
    userPoolId: output('UserPoolId'),
    clientId: output('UserPoolClientId'),
    tablePrefix,
    tables: tables as Record<TableName, string>,
  };
}
