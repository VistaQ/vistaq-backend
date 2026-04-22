/**
 * Tests for the award-points Edge Function — prospect_deleted compensation flow.
 *
 * Run with:
 *   deno test --allow-env --import-map=test_import_map.json index.test.ts
 *
 * Strategy
 * --------
 * 1. Intercept Deno.serve before index.ts loads to capture the handler function.
 * 2. The Supabase client import is redirected to _test_mock_supabase.ts via the
 *    import map, which exposes a shared queryQueue.  Tests push results into the
 *    queue in the order the handler issues queries.
 * 3. Each Deno.test constructs a WebhookPayload, invokes the handler, and asserts
 *    the response and how many queue items were consumed.
 */

import { drainQueue, enqueue, queryQueue } from "./_test_mock_supabase.ts";

// ---------- Types (mirrored from index.ts) ----------

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

// ---------- Intercept Deno.serve before loading index.ts ----------

type Handler = (req: Request) => Response | Promise<Response>;
let capturedHandler: Handler | null = null;

const originalServe = Deno.serve.bind(Deno);

// @ts-ignore — replacing Deno.serve to capture the handler
Deno.serve = (handler: Handler) => {
  capturedHandler = handler;
  return {
    shutdown: () => Promise.resolve(),
    finished: Promise.resolve(),
    ref: () => {},
    unref: () => {},
    [Symbol.asyncDispose]: () => Promise.resolve(),
  } as unknown as Deno.HttpServer;
};

// Set env vars before the module loads
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");

// Load the module — this triggers Deno.serve, capturing the handler
await import("./index.ts");

// Restore Deno.serve
// @ts-ignore
Deno.serve = originalServe;

if (!capturedHandler) {
  throw new Error("Deno.serve was not called during module load — handler not captured");
}

// ---------- Helpers ----------

function makeRequest(payload: WebhookPayload): Request {
  return new Request("https://edge.test/award-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function invoke(payload: WebhookPayload): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await capturedHandler!(makeRequest(payload));
  const body = await res.json() as Record<string, unknown>;
  return { status: res.status, body };
}

/** Standard prospects DELETE payload — old_record has all required fields */
function deletePayload(overrides: Partial<Record<string, unknown>> = {}): WebhookPayload {
  return {
    type: "DELETE",
    table: "prospects",
    schema: "public",
    record: {},
    old_record: {
      id: "prospect-uuid-1",
      agent_id: "agent-uuid-1",
      tenant_id: "tenant-uuid-1",
      ...overrides,
    },
  };
}

/** Standard prospects INSERT payload */
function insertPayload(): WebhookPayload {
  return {
    type: "INSERT",
    table: "prospects",
    schema: "public",
    record: {
      id: "prospect-uuid-2",
      agent_id: "agent-uuid-2",
      tenant_id: "tenant-uuid-2",
    },
    old_record: null,
  };
}

function assertOk(status: number, body: Record<string, unknown>) {
  if (status !== 200) throw new Error(`Expected HTTP 200, got ${status}`);
  if (body.message !== "ok") throw new Error(`Expected { message: 'ok' }, got ${JSON.stringify(body)}`);
}

function assertQueueDrained(label: string) {
  if (queryQueue.length !== 0) {
    throw new Error(
      `[${label}] Expected query queue to be empty but ${queryQueue.length} item(s) remain — ` +
        "handler consumed fewer queries than expected",
    );
  }
}

function assertQueueNotDrained(label: string) {
  // After an early return we expect un-consumed items remain in the queue
  // (set up deliberately as a sentinel)
}

// Reset queue before each test
function setup() {
  drainQueue();
}

// =============================================================================
// Test 1 — detectProspectActivity: DELETE payload resolves to prospect_deleted
// =============================================================================

Deno.test("detectProspectActivity returns 'prospect_deleted' for DELETE events", async () => {
  setup();
  // The handler will proceed through all 5 steps only if activity === 'prospect_deleted'
  // is correctly detected. We seed 5 results so a full run drains the queue.
  enqueue({ data: { subject_type: "prospect" }, error: null }); // step 3: activity types
  enqueue({ data: { points: 10 }, error: null });                // step 4: point_configs
  enqueue({ data: null, error: null });                           // step 5: idempotency → not found
  enqueue({ data: [{ points: 10 }], error: null });              // step 6a: sum query
  enqueue({ data: null, error: null });                           // step 6b: insert

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  assertQueueDrained("detectProspectActivity DELETE");
});

// =============================================================================
// Test 2 — DELETE reads agent_id / tenant_id / id from old_record, not record
// =============================================================================

Deno.test("DELETE event reads agent_id, tenant_id, id from old_record (not record)", async () => {
  setup();
  // record is intentionally empty — if the handler reads record it finds no agent_id
  // and bails before issuing any DB query. If it reads old_record it continues.
  enqueue({ data: null, error: null }); // activity types → null (causes graceful skip)

  const payload: WebhookPayload = {
    type: "DELETE",
    table: "prospects",
    schema: "public",
    record: {}, // no agent_id here
    old_record: {
      id: "prospect-uuid-3",
      agent_id: "agent-uuid-3",
      tenant_id: "tenant-uuid-3",
    },
  };

  const { status, body } = await invoke(payload);
  assertOk(status, body);
  // If handler read from record (no agent_id), it would have returned early before
  // touching the DB — the queue item would still be present.
  assertQueueDrained("old_record reading");
});

// =============================================================================
// Test 3 — DELETE: point_activity_types row missing → skips insert
// =============================================================================

Deno.test("DELETE event: missing point_activity_types row skips all further steps", async () => {
  setup();
  enqueue({ data: null, error: null }); // activity types → not found

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  assertQueueDrained("missing activity type");
});

// =============================================================================
// Test 4 — DELETE: point_configs row missing → skips insert
// =============================================================================

Deno.test("DELETE event: missing point_configs row skips insert", async () => {
  setup();
  enqueue({ data: { subject_type: "prospect" }, error: null }); // activity types → found
  enqueue({ data: null, error: null });                           // point_configs → not found

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  assertQueueDrained("missing point config");
});

// =============================================================================
// Test 5 — DELETE: prior prospect_deleted transaction exists → idempotency skip
// =============================================================================

Deno.test("DELETE event: existing prospect_deleted transaction triggers idempotency skip", async () => {
  setup();
  enqueue({ data: { subject_type: "prospect" }, error: null });    // activity types
  enqueue({ data: { points: 10 }, error: null });                   // point_configs
  enqueue({ data: { id: "existing-tx-uuid" }, error: null });       // idempotency → found

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  // No sum query or insert should be called
  assertQueueDrained("idempotency skip");
});

// =============================================================================
// Test 6a — DELETE: totalAwarded <= 0 (empty prior rows) → skips insert
// =============================================================================

Deno.test("DELETE event: totalAwarded = 0 (no prior transactions) skips insert", async () => {
  setup();
  enqueue({ data: { subject_type: "prospect" }, error: null }); // activity types
  enqueue({ data: { points: 10 }, error: null });                // point_configs
  enqueue({ data: null, error: null });                           // idempotency → not found
  enqueue({ data: [], error: null });                             // sum query → empty → totalAwarded = 0

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  assertQueueDrained("totalAwarded=0");
});

// =============================================================================
// Test 6b — DELETE: totalAwarded <= 0 (net negative prior rows) → skips insert
// =============================================================================

Deno.test("DELETE event: totalAwarded <= 0 (net negative prior transactions) skips insert", async () => {
  setup();
  enqueue({ data: { subject_type: "prospect" }, error: null });
  enqueue({ data: { points: 10 }, error: null });
  enqueue({ data: null, error: null });
  enqueue({ data: [{ points: -3 }, { points: -5 }], error: null }); // sum = -8

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  assertQueueDrained("net negative totalAwarded");
});

// =============================================================================
// Test 7 — Happy path: DELETE with prior positive points → insert is called
// =============================================================================

Deno.test(
  "DELETE event happy path: prior positive points causes compensation insert (all 5 steps consumed)",
  async () => {
    setup();
    enqueue({ data: { subject_type: "prospect" }, error: null });           // step 3
    enqueue({ data: { points: 10 }, error: null });                          // step 4
    enqueue({ data: null, error: null });                                     // step 5: not found
    enqueue({ data: [{ points: 15 }, { points: 10 }], error: null });       // step 6 sum → 25
    enqueue({ data: null, error: null });                                     // step 6 insert

    const { status, body } = await invoke(deletePayload());
    assertOk(status, body);
    // All 5 items consumed confirms insert was called
    assertQueueDrained("happy path — insert called");
  },
);

// =============================================================================
// Test 8 — Regression: INSERT (prospect_created) still fires correctly
// =============================================================================

Deno.test(
  "regression: INSERT prospect_created follows the normal (non-delete) code path",
  async () => {
    setup();
    enqueue({ data: { subject_type: "prospect" }, error: null }); // activity types
    enqueue({ data: { points: 5 }, error: null });                 // point_configs
    enqueue({ data: null, error: null });                           // idempotency → not found
    enqueue({ data: null, error: null });                           // insert

    const { status, body } = await invoke(insertPayload());
    assertOk(status, body);
    // 4 items consumed (no sum query) confirms the non-delete path was used
    assertQueueDrained("prospect_created regression");
  },
);

// =============================================================================
// Test 9 — DELETE: sum query returns an error → returns ok, no insert
// =============================================================================

Deno.test("DELETE event: sum query DB error causes graceful skip (no insert)", async () => {
  setup();
  enqueue({ data: { subject_type: "prospect" }, error: null });
  enqueue({ data: { points: 10 }, error: null });
  enqueue({ data: null, error: null });                                           // idempotency
  enqueue({ data: null, error: { message: "connection error" } });               // sum query error

  const { status, body } = await invoke(deletePayload());
  assertOk(status, body);
  assertQueueDrained("sum query error");
});

// =============================================================================
// Test 10 — DELETE: old_record missing agent_id → early return before DB queries
// =============================================================================

Deno.test("DELETE event: old_record missing agent_id returns ok without any DB queries", async () => {
  setup();
  // Enqueue a sentinel — if the handler reads it we know it didn't bail early
  enqueue({ data: { subject_type: "prospect" }, error: null });

  const payload: WebhookPayload = {
    type: "DELETE",
    table: "prospects",
    schema: "public",
    record: {},
    old_record: {
      id: "prospect-uuid-x",
      // agent_id intentionally absent
      tenant_id: "tenant-uuid-x",
    },
  };

  const { status, body } = await invoke(payload);
  assertOk(status, body);
  // Sentinel must still be in the queue (handler bailed before querying)
  if (queryQueue.length !== 1) {
    throw new Error(
      `Expected sentinel to remain in queue (handler should have bailed early), ` +
        `but queue has ${queryQueue.length} item(s)`,
    );
  }
  drainQueue();
});

// =============================================================================
// Test 11 — Unrecognised table → handler returns ok without any DB queries
// =============================================================================

Deno.test("Unrecognised table in payload returns ok without processing", async () => {
  setup();
  enqueue({ data: null, error: null }); // sentinel

  const { status, body } = await invoke({
    type: "INSERT",
    table: "unknown_table",
    schema: "public",
    record: { id: "x" },
    old_record: null,
  });

  assertOk(status, body);
  if (queryQueue.length !== 1) {
    throw new Error(
      `Expected sentinel to remain for unrecognised table, but queue has ${queryQueue.length} item(s)`,
    );
  }
  drainQueue();
});

// =============================================================================
// Test 12 — Malformed JSON → handler swallows error and returns ok
// =============================================================================

Deno.test("Malformed request body returns ok (outer catch swallows unexpected errors)", async () => {
  setup();
  const badReq = new Request("https://edge.test/award-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not valid json }",
  });

  const res = await capturedHandler!(badReq);
  const body = await res.json() as Record<string, unknown>;

  assertOk(res.status, body);
});
