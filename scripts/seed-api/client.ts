import createClient, { type Client } from 'openapi-fetch';

import type { paths } from './api';

// The API and the stream consumers share the account's 10 concurrent Lambda
// executions in ap-southeast-5, so the seed leaves most of them free.
export const MAX_IN_FLIGHT = 3;
const MAX_ATTEMPTS = 5;

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
  const baseDelayMs = options.baseDelayMs ?? 250;

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
      await wait(baseDelayMs * 2 ** (attempt - 1));
    }
  };

  return createClient<paths>({
    baseUrl: options.baseUrl,
    fetch: resilientFetch,
  });
}
