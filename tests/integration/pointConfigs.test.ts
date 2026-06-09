import path from 'path';
import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/point-configs, GET /api/point-configs,
                PUT /api/point-configs/:activity
******************************************************************************/

// Credentials are sourced from the seed manifest written by scripts/bootstrap.js.
// Run `npx supabase db reset && node scripts/bootstrap.js` to regenerate.
const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantSlug: string;
  adminPassword: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string; groupId?: string }>;
};

const TENANT_SLUG = manifest.tenantSlug;
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = manifest.adminPassword;

/**
 * Agent account — created in beforeAll via POST /api/auth/register.
 * Agent role is not admin, so it is used for 403 checks.
 * Uses agent code AG002 (seeded, unused).
 */
const AGENT_EMAIL = `test.pointconfigs.agent.${Date.now()}@example.com`;
const AGENT_PASSWORD = 'Password1!';
const AGENT_AGENT_CODE = 'AG002';

let adminToken: string | null = null;
let agentToken: string | null = null;

/** ID of the agent user created in beforeAll — deleted in afterAll */
let agentUserId: string | null = null;

/**
 * Activities for which we created point_config rows during this test run.
 * Deleted in afterAll.
 */
const createdActivities: string[] = [];

/** The seeded group that the test agent belongs to */
const GROUP_ID_ALPHA = '00000000-0000-4000-8000-000000000001';

/******************************************************************************
  beforeAll — obtain tokens
******************************************************************************/

beforeAll(async () => {
  // ── 1. Log in as admin ──────────────────────────────────────────────────────
  const adminRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (adminRes.status === 200 && adminRes.body?.data?.token) {
    adminToken = adminRes.body.data.token as string;
  }

  // ── 2. Clean up any stale agent from a previous run ────────────────────────
  try {
    const { data: staleAgents } = await supabaseService.adminSelect(
      'users',
      'id',
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
    for (const row of (staleAgents ?? []) as unknown as { id: string }[]) {
      try {
        await supabaseService.adminDeleteAuthUser(row.id);
      } catch {
        try {
          await supabaseService.adminDelete('users', { id: row.id });
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }

  // Reset AG002
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // ── 3. Register an agent user for 403 tests ─────────────────────────────────
  const agentRegisterRes = await request(app)
    .post('/api/auth/register')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({
      fullName: 'Test PointConfigs Agent',
      agentCode: AGENT_AGENT_CODE,
      email: AGENT_EMAIL,
      password: AGENT_PASSWORD,
      groupId: GROUP_ID_ALPHA,
      location: 'Kuala Lumpur',
    });

  if (agentRegisterRes.status === 201 && agentRegisterRes.body?.data?.user?.id) {
    agentUserId = agentRegisterRes.body.data.user.id as string;
    agentToken = (agentRegisterRes.body.data.token as string) ?? null;
  }

  // Fall back to login if token was not returned by register
  if (!agentToken && agentUserId) {
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: AGENT_EMAIL, password: AGENT_PASSWORD });

    if (agentLoginRes.status === 200 && agentLoginRes.body?.data?.token) {
      agentToken = agentLoginRes.body.data.token as string;
    }
  }

  // ── 4. Clean up any stale point_config rows for the test activity ───────────
  try {
    await supabaseService.adminDelete('point_configs', {
      activity: 'prospect_created',
      tenant_id: TENANT_ID,
    });
  } catch { /* best-effort */ }
}, 30000);

/******************************************************************************
  afterAll — delete created point_config rows and agent user
******************************************************************************/

afterAll(async () => {
  // Delete all point_config rows created during the test run
  for (const activity of createdActivities) {
    try {
      await supabaseService.adminDelete('point_configs', {
        activity,
        tenant_id: TENANT_ID,
      });
    } catch { /* best-effort */ }
  }

  // Delete agent user
  if (agentUserId) {
    try {
      await supabaseService.adminDeleteAuthUser(agentUserId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: agentUserId });
      } catch { /* best-effort */ }
    }
  }

  // Reset AG002
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }
});

/******************************************************************************
  POST /api/point-configs
******************************************************************************/

describe('POST /api/point-configs — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/point-configs')
      .send({ activity: 'prospect_created', points: 10 });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/point-configs — role guard', () => {
  it('returns 403 for a non-admin role (agent)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .post('/api/point-configs')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ activity: 'prospect_created', points: 10 });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/point-configs — validation', () => {
  it('returns 400 for an invalid activity value', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activity: 'invalid_activity', points: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Invalid activity type.');
  });

  it('returns 400 when points is 0', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activity: 'prospect_created', points: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when points is negative', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activity: 'prospect_created', points: -5 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('POST /api/point-configs — happy path', () => {
  it('returns 201 with the correct shape on success', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activity: 'prospect_created', points: 10 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const config = res.body.data as Record<string, unknown>;
    expect(config).toHaveProperty('id');
    expect(config).toHaveProperty('activity', 'prospect_created');
    expect(config).toHaveProperty('points', 10);
    expect(config).toHaveProperty('tenant_id');
    expect(config).toHaveProperty('created_at');
    expect(config).toHaveProperty('updated_at');

    // Track for cleanup
    createdActivities.push('prospect_created');
  });
});

describe('POST /api/point-configs — duplicate', () => {
  it('returns 400 when trying to create a config for an activity that already exists', async () => {
    expect(adminToken).not.toBeNull();

    // prospect_created was already created in the happy path test above
    const res = await request(app)
      .post('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ activity: 'prospect_created', points: 20 });

    expect(res.status).toBe(400);
  });
});

/******************************************************************************
  GET /api/point-configs
******************************************************************************/

describe('GET /api/point-configs — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/point-configs');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/point-configs — role guard', () => {
  it('returns 403 for a non-admin role (agent)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/point-configs')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/point-configs — happy path', () => {
  it('returns 200 with an array', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 200 and includes the previously created config in the array', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/point-configs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const configs = res.body.data as Record<string, unknown>[];
    const created = configs.find((c) => c['activity'] === 'prospect_created');
    expect(created).toBeDefined();
    expect(created).toHaveProperty('points', 10);
  });
});

/******************************************************************************
  PUT /api/point-configs/:activity
******************************************************************************/

describe('PUT /api/point-configs/:activity — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .put('/api/point-configs/prospect_created')
      .send({ points: 20 });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/point-configs/:activity — role guard', () => {
  it('returns 403 for a non-admin role (agent)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .put('/api/point-configs/prospect_created')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ points: 20 });

    expect(res.status).toBe(403);
  });
});

describe('PUT /api/point-configs/:activity — not found', () => {
  it('returns 404 for an unknown/invalid activity path param', async () => {
    expect(adminToken).not.toBeNull();

    // The route accepts any string in the path; service will not find a row
    const res = await request(app)
      .put('/api/point-configs/not_a_real_activity')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points: 15 });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/point-configs/:activity — validation', () => {
  it('returns 400 when points is 0', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put('/api/point-configs/prospect_created')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when points is negative', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put('/api/point-configs/prospect_created')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points: -1 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('PUT /api/point-configs/:activity — happy path', () => {
  it('returns 200 with the updated points', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put('/api/point-configs/prospect_created')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ points: 25 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const config = res.body.data as Record<string, unknown>;
    expect(config).toHaveProperty('activity', 'prospect_created');
    expect(config).toHaveProperty('points', 25);
    expect(config).toHaveProperty('id');
    expect(config).toHaveProperty('tenant_id');
    expect(config).toHaveProperty('created_at');
    expect(config).toHaveProperty('updated_at');
  });
});
