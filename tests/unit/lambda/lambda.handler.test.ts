import { describe, it, expect, beforeAll } from 'vitest';
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
