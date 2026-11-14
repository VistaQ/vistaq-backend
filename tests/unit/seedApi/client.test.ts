import { describe, expect, it, vi } from 'vitest';

import {
  backoffDelay,
  createApiClient,
  createLimiter,
  MAX_ATTEMPTS,
  MAX_IN_FLIGHT,
} from '../../../scripts/seed-api/client';

const BASE_URL = 'https://api.test/api';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const client = (
  send: (request: Request) => Promise<Response>,
  token?: (refresh: boolean) => Promise<string>,
) =>
  createApiClient({
    baseUrl: BASE_URL,
    limiter: createLimiter(),
    fetch: send,
    token,
    baseDelayMs: 0,
  });

describe('seed API client', () => {
  it('retries a 429 and returns the later success', async () => {
    const send = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(json(429))
      .mockResolvedValueOnce(json(200, { success: true, data: [] }));

    const { data, response } = await client(send).GET('/public/groups');

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true, data: [] });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('gives up after the last attempt on repeated server errors', async () => {
    const send = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockImplementation(async () => json(503));

    const { response } = await client(send).GET('/public/groups');

    expect(response.status).toBe(503);
    expect(send).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('waits long enough to outlast a throttling burst, capped and jittered', () => {
    const waits = Array.from({ length: MAX_ATTEMPTS - 1 }, (_, i) =>
      backoffDelay(i + 1, 500, () => 1),
    );
    expect(waits.reduce((total, ms) => total + ms, 0)).toBeGreaterThanOrEqual(
      30_000,
    );
    expect(Math.max(...waits)).toBe(10_000);
    expect(backoffDelay(3, 500, () => 0)).toBe(1_000);
  });

  it('does not retry a client error', async () => {
    const send = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValue(json(400, { message: 'Validation failed' }));

    const { response } = await client(send).GET('/public/groups');

    expect(response.status).toBe(400);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends the bearer token and signs in again once after a 401', async () => {
    const token = vi
      .fn<(refresh: boolean) => Promise<string>>()
      .mockImplementation(async (refresh) => (refresh ? 'fresh' : 'stale'));
    const seen: (string | null)[] = [];
    const send = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockImplementation(async (request) => {
        seen.push(request.headers.get('Authorization'));
        return seen.length === 1 ? json(401) : json(200, { success: true });
      });

    const { response } = await client(send, token).GET('/public/groups');

    expect(response.status).toBe(200);
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
    expect(token.mock.calls).toEqual([[false], [true]]);
  });

  it('returns a second 401 instead of signing in again forever', async () => {
    const token = vi
      .fn<(refresh: boolean) => Promise<string>>()
      .mockResolvedValue('t');
    const send = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockImplementation(async () => json(401));

    const { response } = await client(send, token).GET('/public/groups');

    expect(response.status).toBe(401);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('resends the same body when it retries', async () => {
    const bodies: string[] = [];
    const send = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockImplementation(async (request) => {
        bodies.push(await request.text());
        return bodies.length === 1
          ? json(429)
          : json(200, { success: true, data: { session: 's' } });
      });

    await client(send).POST('/auth/login', {
      body: { email: 'seed-agent-01@example.com' },
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1])).toEqual({
      email: 'seed-agent-01@example.com',
    });
  });

  it(`never runs more than ${MAX_IN_FLIGHT} requests at once across clients`, async () => {
    const limiter = createLimiter();
    let inFlight = 0;
    let peak = 0;
    const send = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return json(200, { success: true, data: [] });
    };
    const clients = [1, 2].map(() =>
      createApiClient({ baseUrl: BASE_URL, limiter, fetch: send }),
    );

    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        clients[i % 2].GET('/public/groups'),
      ),
    );

    expect(peak).toBe(MAX_IN_FLIGHT);
  });
});
