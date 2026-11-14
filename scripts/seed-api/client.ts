import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './api';

// The API and the stream consumers share the account's 10 concurrent Lambda
// executions in ap-southeast-5. The consumers alone reached 11 on dev, so
// throttled requests (503) retry for about half a minute before giving up.
export const MAX_IN_FLIGHT = 3;
export const MAX_ATTEMPTS = 8;
const MAX_DELAY_MS = 10_000;

export type ApiClient = Client<paths>;
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;
export type TokenSource = (refresh: boolean) => Promise<string>;

export function createLimiter(max: number = MAX_IN_FLIGHT): Limiter {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async (task) => {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRetryable = (status: number) => status === 429 || status >= 500;

/** Exponential up to the cap, then scaled by `random` into 50-100% of it. */
export const backoffDelay = (
  attempt: number,
  baseDelayMs: number,
  random: () => number = Math.random,
): number =>
  Math.min(baseDelayMs * 2 ** (attempt - 1), MAX_DELAY_MS) *
  (0.5 + random() / 2);

export interface IClientOptions {
  baseUrl: string;
  limiter: Limiter;
  token?: TokenSource;
  fetch?: (request: Request) => Promise<Response>;
  baseDelayMs?: number;
}

/** A client for one caller; `token(true)` must sign in again after a 401. */
export function createApiClient(options: IClientOptions): ApiClient {
  const send = options.fetch ?? ((request: Request) => fetch(request));
  const baseDelayMs = options.baseDelayMs ?? 500;

  const resilientFetch = async (request: Request): Promise<Response> => {
    let refresh = false;
    let refreshedOnce = false;
    for (let attempt = 1; ; attempt++) {
      const outgoing = request.clone();
      if (options.token) {
        outgoing.headers.set(
          'Authorization',
          `Bearer ${await options.token(refresh)}`,
        );
      }
      refresh = false;
      const response = await options.limiter(() => send(outgoing));

      if (response.status === 401 && options.token && !refreshedOnce) {
        refreshedOnce = true;
        refresh = true;
        continue;
      }
      if (!isRetryable(response.status) || attempt >= MAX_ATTEMPTS) {
        return response;
      }
      await wait(backoffDelay(attempt, baseDelayMs));
    }
  };

  return createClient<paths>({
    baseUrl: options.baseUrl,
    fetch: resilientFetch,
  });
}
