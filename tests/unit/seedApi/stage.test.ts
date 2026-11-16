import { beforeEach, describe, expect, it } from 'vitest';

import {
  CloudFormationClient,
  DescribeStacksCommand,
  ListStackResourcesCommand,
} from '@aws-sdk/client-cloudformation';
import { mockClient } from 'aws-sdk-client-mock';

import { TABLE_NAMES } from '@src/constants/tables';

import {
  resolveStage,
  StageError,
  stageFromArgs,
} from '../../../scripts/seed-api/stage';

const cloudFormation = mockClient(CloudFormationClient);
const client = () => new CloudFormationClient({ region: 'ap-southeast-5' });

const outputs = [
  { OutputKey: 'HttpApiUrl', OutputValue: 'https://abc.execute-api.test' },
  { OutputKey: 'UserPoolId', OutputValue: 'ap-southeast-5_pool' },
  { OutputKey: 'UserPoolClientId', OutputValue: 'client-1' },
];

const tableResources = (prefix: string) =>
  TABLE_NAMES.map((base) => ({
    LogicalResourceId: `${base}Table`,
    PhysicalResourceId: `${prefix}${base}`,
    ResourceType: 'AWS::DynamoDB::Table',
  }));

const stack = (prefix: string) => {
  cloudFormation
    .on(DescribeStacksCommand)
    .resolves({ Stacks: [{ StackName: 'vistaq-x', Outputs: outputs } as never] });
  const resources = [
    ...tableResources(prefix),
    {
      LogicalResourceId: 'ApiLambdaFunction',
      PhysicalResourceId: 'vistaq-x-api',
      ResourceType: 'AWS::Lambda::Function',
    },
    {
      LogicalResourceId: 'StatsQueue',
      PhysicalResourceId: 'https://sqs.test/1/vistaq-x-stats.fifo',
      ResourceType: 'AWS::SQS::Queue',
    },
  ];
  const half = Math.ceil(resources.length / 2);
  cloudFormation
    .on(ListStackResourcesCommand)
    .resolvesOnce({
      StackResourceSummaries: resources.slice(0, half) as never,
      NextToken: 'page-2',
    })
    .resolvesOnce({ StackResourceSummaries: resources.slice(half) as never });
};

beforeEach(() => cloudFormation.reset());

describe('stageFromArgs', () => {
  it('reads the value after --stage', () => {
    expect(stageFromArgs(['--stage', 'staging', '--dry-run'])).toBe('staging');
  });

  it.each([[[]], [['--stage']], [['--stage', '--dry-run']]])(
    'refuses a missing stage in %j',
    (argv) => {
      expect(() => stageFromArgs(argv)).toThrow(/Missing --stage/);
    },
  );

  it('refuses production', () => {
    expect(() => stageFromArgs(['--stage', 'production'])).toThrow(
      StageError,
    );
  });
});

describe('resolveStage', () => {
  it('reads the API, pool, client and every table from the stage stack', async () => {
    stack('stg_vistaq_');

    const stage = await resolveStage('staging', client());

    expect(stage).toMatchObject({
      name: 'staging',
      region: 'ap-southeast-5',
      apiUrl: 'https://abc.execute-api.test/api',
      userPoolId: 'ap-southeast-5_pool',
      clientId: 'client-1',
      tablePrefix: 'stg_vistaq_',
    });
    expect(stage.tables.Users).toBe('stg_vistaq_Users');
    expect(stage.queues).toEqual({
      StatsQueue: 'https://sqs.test/1/vistaq-x-stats.fifo',
    });
    expect(Object.keys(stage.tables).sort()).toEqual([...TABLE_NAMES].sort());
    expect(
      cloudFormation.commandCalls(DescribeStacksCommand)[0].args[0].input
        .StackName,
    ).toBe('vistaq-staging');
  });

  it('refuses production before calling AWS', async () => {
    await expect(
      resolveStage('production', client()),
    ).rejects.toThrow(StageError);
    expect(cloudFormation.calls()).toHaveLength(0);
  });

  it('refuses a stack whose tables carry the production prefix', async () => {
    stack('prod_vistaq_');

    await expect(resolveStage('prodlike', client())).rejects.toThrow(
      /prod_vistaq_/,
    );
  });

  it('refuses a stack missing an output', async () => {
    cloudFormation
      .on(DescribeStacksCommand)
      .resolves({ Stacks: [{ StackName: 'vistaq-x', Outputs: outputs.slice(1) } as never] });
    cloudFormation
      .on(ListStackResourcesCommand)
      .resolves({ StackResourceSummaries: tableResources('stg_vistaq_') as never });

    await expect(resolveStage('staging', client())).rejects.toThrow(
      /HttpApiUrl/,
    );
  });

  it('refuses a stack missing a table', async () => {
    cloudFormation
      .on(DescribeStacksCommand)
      .resolves({ Stacks: [{ StackName: 'vistaq-x', Outputs: outputs } as never] });
    cloudFormation.on(ListStackResourcesCommand).resolves({
      StackResourceSummaries: tableResources('stg_vistaq_').slice(1) as never,
    });

    await expect(resolveStage('staging', client())).rejects.toThrow(
      new RegExp(`no table for ${TABLE_NAMES[0]}`),
    );
  });
});
