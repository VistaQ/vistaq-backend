/**
 * Mock for @supabase/supabase-js used in tests.
 * The test file imports this module and controls queryQueue to drive responses.
 */

export interface MockQueryResult {
  data: unknown;
  error: unknown;
}

export const queryQueue: MockQueryResult[] = [];

export function enqueue(result: MockQueryResult): void {
  queryQueue.push(result);
}

export function drainQueue(): void {
  queryQueue.length = 0;
}

function makeChain(): unknown {
  const terminal = (): Promise<MockQueryResult> => {
    const result = queryQueue.shift() ?? {
      data: null,
      error: { message: "Mock queue empty — did you enqueue enough results?" },
    };
    return Promise.resolve(result);
  };

  const c: Record<string, unknown> = {};
  const passthrough = (..._args: unknown[]) => makeChain();

  for (const m of ["select", "eq", "maybeSingle", "single", "update", "delete", "insert"]) {
    c[m] = passthrough;
  }

  // Make the chain awaitable
  c["then"] = (
    resolve: (v: MockQueryResult) => unknown,
    _reject?: (e: unknown) => unknown,
  ) => terminal().then(resolve);

  return c;
}

export function createClient(_url: string, _key: string) {
  return {
    from: (_table: string) => makeChain(),
  };
}
