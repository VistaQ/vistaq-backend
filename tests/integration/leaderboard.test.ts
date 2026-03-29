import path from 'path';
import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — GET /api/leaderboard
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

const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = manifest.adminPassword;

// Use a seeded agent for all-roles-permitted checks
const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;
const AGENT_PASSWORD = manifest.password;

let adminToken: string | null = null;
let agentToken: string | null = null;

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

  // ── 2. Log in as agent ──────────────────────────────────────────────────────
  const agentRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: AGENT_EMAIL, password: AGENT_PASSWORD });

  if (agentRes.status === 200 && agentRes.body?.data?.token) {
    agentToken = agentRes.body.data.token as string;
  }
}, 30000);

/******************************************************************************
  GET /api/leaderboard — auth guard
******************************************************************************/

describe('GET /api/leaderboard — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/leaderboard');

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  GET /api/leaderboard — happy path (admin)
******************************************************************************/

describe('GET /api/leaderboard — happy path (admin)', () => {
  it('returns 200 with success true and a data array', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns entries with the correct shape', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const data = res.body.data as Record<string, unknown>[];

    // The leaderboard may be empty if no points have been awarded yet;
    // only assert shape when entries are present.
    if (data.length > 0) {
      const entry = data[0];
      expect(entry).toHaveProperty('agent_id');
      expect(entry).toHaveProperty('agent_name');
      expect(entry).toHaveProperty('agent_code');
      expect(entry).toHaveProperty('group_id');
      expect(entry).toHaveProperty('group_name');
      expect(entry).toHaveProperty('total_points');
    }
  });

  it('returns total_points as a number for every entry', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const data = res.body.data as Record<string, unknown>[];

    for (const entry of data) {
      expect(typeof entry['total_points']).toBe('number');
    }
  });
});

/******************************************************************************
  GET /api/leaderboard — all roles permitted (agent)
******************************************************************************/

describe('GET /api/leaderboard — all roles permitted', () => {
  it('returns 200 for an agent role (no 403)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
