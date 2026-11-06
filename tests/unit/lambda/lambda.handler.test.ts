import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';

type IHandler = (
  event: APIGatewayProxyEventV2,
  context: Context,
) => Promise<{ statusCode: number; body: string }>;

const apiGatewayEvent = (method: string, path: string): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1' },
    },
    isBase64Encoded: false,
  }) as unknown as APIGatewayProxyEventV2;

describe('Lambda handler', () => {
  let handler: IHandler;

  beforeAll(async () => {
    process.env.USERS_TABLE ??= 'users-table';
    process.env.AGENT_CODES_TABLE ??= 'agent-codes-table';
    process.env.GROUP_TRAINERS_TABLE ??= 'group-trainers-table';
    process.env.COGNITO_USER_POOL_ID ??= 'ap-southeast-1_test';
    process.env.COGNITO_CLIENT_ID ??= 'test-client';
    process.env.ETL_SERVICE_URL ??= 'http://etl.test';
    process.env.ETL_API_KEY ??= 'test-key';
    process.env.BACKEND_BASE_URL ??= 'http://backend.test';
    const loaded = await import('@src/lambda');
    handler = loaded.handler as unknown as IHandler;
  });

  it('answers GET /health with 200 and status ok', async () => {
    const res = await handler(
      apiGatewayEvent('GET', '/health'),
      {} as Context,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('status', 'ok');
  });

  it('serves the OpenAPI document from the working directory', async () => {
    const res = await handler(
      apiGatewayEvent('GET', '/openapi.yaml'),
      {} as Context,
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('openapi:');
  });

  it('answers an unknown path with 404', async () => {
    const res = await handler(
      apiGatewayEvent('GET', '/no/such/route'),
      {} as Context,
    );

    expect(res.statusCode).toBe(404);
  });
});
