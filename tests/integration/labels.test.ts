import path from 'path';
import request from 'supertest';

import app from '@src/app';
import { DEFAULT_LABELS } from '@src/constants/defaultLabels';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — Tenant Labels (read-only)
    GET /api/labels   (all roles) — merged DEFAULT_LABELS + tenant overrides

  NOTE: Cross-tenant isolation is enforced by RLS plus the service-layer tenant
  filter, but it is NOT exercised here: the seed fixtures define a single tenant
  (per project decision), so there is no second tenant to assert against. This
  mirrors the taxonomies integration suite.
******************************************************************************/

// Credentials are sourced from the seed manifest written by scripts/bootstrap.js.
const manifest = require(path.join(
  __dirname,
  '../../scripts/seed-manifest.json',
)) as {
  tenantId: string;
  tenantSlug: string;
  adminPassword: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
};

const TENANT_ID = manifest.tenantId;
const TENANT_SLUG = manifest.tenantSlug;

const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = manifest.adminPassword;

const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;
const AGENT_PASSWORD = manifest.password;

// A default key the test guarantees it never overrides — used to assert the
// default value survives even when other keys are overridden by the tenant.
const NON_OVERRIDDEN_KEY = 'metric.fyct';
const NON_OVERRIDDEN_DEFAULT = DEFAULT_LABELS[NON_OVERRIDDEN_KEY];

// The key the override test replaces for the seeded tenant.
const OVERRIDE_KEY = 'metric.ace';
const OVERRIDE_VALUE = 'ACE';

let adminToken: string | null = null;
let agentToken: string | null = null;

/** Track every tenant_labels id created by the test so afterAll can clean up. */
const createdIds: (string | null)[] = [];

function track(id: string): string {
  createdIds.push(id);
  return id;
}

function adminAuth() {
  return `Bearer ${adminToken}`;
}

function agentAuth() {
  return `Bearer ${agentToken}`;
}

/******************************************************************************
  beforeAll — obtain tokens via real login
******************************************************************************/

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (adminRes.status === 200 && adminRes.body?.data?.token) {
    adminToken = adminRes.body.data.token as string;
  }

  const agentRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: AGENT_EMAIL, password: AGENT_PASSWORD });

  if (agentRes.status === 200 && agentRes.body?.data?.token) {
    agentToken = agentRes.body.data.token as string;
  }
}, 30000);

/******************************************************************************
  afterAll — delete every tenant_labels row created by the test (best-effort)
******************************************************************************/

afterAll(async () => {
  for (const id of createdIds) {
    if (!id) continue;
    try {
      await supabaseService.adminDelete('tenant_labels', { id });
    } catch {
      // best-effort
    }
  }
});

/******************************************************************************
  GET /api/labels — defaults when no overrides
******************************************************************************/

describe('GET /api/labels — defaults when no overrides', () => {
  it('returns the default value for a key the tenant has not overridden', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/labels')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const data = res.body.data as Record<string, string>;
    expect(data[NON_OVERRIDDEN_KEY]).toBe(NON_OVERRIDDEN_DEFAULT);
  });
});

/******************************************************************************
  GET /api/labels — all default keys present
******************************************************************************/

describe('GET /api/labels — all default keys present', () => {
  it('includes every key from DEFAULT_LABELS in the response map', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/labels')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, string>;

    // NOTE: Label keys contain dots (e.g. 'metric.ace'). Jest's toHaveProperty
    // treats a dotted string as a nested keypath, so assert membership via the
    // own-keys list and bracket access instead.
    const responseKeys = Object.keys(data);
    for (const key of Object.keys(DEFAULT_LABELS)) {
      expect(responseKeys).toContain(key);
      expect(typeof data[key]).toBe('string');
    }
  });
});

/******************************************************************************
  GET /api/labels — tenant override replaces default
******************************************************************************/

describe('GET /api/labels — tenant override replaces default', () => {
  it('returns the tenant override while non-overridden keys keep defaults', async () => {
    expect(adminToken).not.toBeNull();

    const insertRes = await supabaseService.adminInsert('tenant_labels', {
      tenant_id: TENANT_ID,
      key: OVERRIDE_KEY,
      value: OVERRIDE_VALUE,
    });

    expect(insertRes.error).toBeNull();
    const inserted = (insertRes.data ?? []) as { id: string }[];
    expect(inserted.length).toBeGreaterThan(0);
    track(inserted[0].id);

    const res = await request(app)
      .get('/api/labels')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, string>;

    // Override wins for the overridden key.
    expect(data[OVERRIDE_KEY]).toBe(OVERRIDE_VALUE);
    // A non-overridden key still shows its default value.
    expect(data[NON_OVERRIDDEN_KEY]).toBe(NON_OVERRIDDEN_DEFAULT);
  });
});

/******************************************************************************
  GET /api/labels — agent role can read
******************************************************************************/

describe('GET /api/labels — access', () => {
  it('is accessible to a non-admin role (agent) → 200 with a populated map', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/labels')
      .set('Authorization', agentAuth());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, string>;
    expect(Object.keys(data).length).toBeGreaterThanOrEqual(
      Object.keys(DEFAULT_LABELS).length,
    );
    expect(data[NON_OVERRIDDEN_KEY]).toBe(NON_OVERRIDDEN_DEFAULT);
  });
});

/******************************************************************************
  GET /api/labels — auth guard
******************************************************************************/

describe('GET /api/labels — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/labels');
    expect(res.status).toBe(401);
  });
});
