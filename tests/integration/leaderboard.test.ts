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

/******************************************************************************
  GET /api/leaderboard/stats — auth guard
******************************************************************************/

describe('GET /api/leaderboard/stats — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/leaderboard/stats?period=mtd');

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  GET /api/leaderboard/stats — validation errors
******************************************************************************/

describe('GET /api/leaderboard/stats — validation errors', () => {
  it('returns 400 with validation failed message when no period param is supplied', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with validation failed message when period is an invalid value', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats?period=weekly')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  GET /api/leaderboard/stats — happy path (admin)
******************************************************************************/

describe('GET /api/leaderboard/stats — happy path (admin)', () => {
  it('returns 200 with correct top-level shape for period=mtd', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats?period=mtd')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const { data } = res.body;
    expect(data).toHaveProperty('period', 'mtd');
    expect(data).toHaveProperty('generated_at');
    expect(typeof data.generated_at).toBe('string');
    expect(Array.isArray(data.individual)).toBe(true);
    expect(Array.isArray(data.groups)).toBe(true);
  });

  it('returns 200 with correct top-level shape for period=ytd', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats?period=ytd')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const { data } = res.body;
    expect(data).toHaveProperty('period', 'ytd');
    expect(data).toHaveProperty('generated_at');
    expect(Array.isArray(data.individual)).toBe(true);
    expect(Array.isArray(data.groups)).toBe(true);
  });

  it('individual entries have the correct shape with numeric counts', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats?period=mtd')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const { individual } = res.body.data as {
      individual: Record<string, unknown>[];
      groups: Record<string, unknown>[];
    };

    // Only assert shape when entries are present
    if (individual.length > 0) {
      const entry = individual[0];
      expect(entry).toHaveProperty('user_id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('agent_code');
      expect(entry).toHaveProperty('group_id');
      expect(entry).toHaveProperty('group_name');
      expect(entry).toHaveProperty('prospects_added');
      expect(entry).toHaveProperty('appointments_completed');
      expect(entry).toHaveProperty('sales_meetings');
      expect(entry).toHaveProperty('sales_successful');
      expect(entry).toHaveProperty('total_points');

      expect(typeof entry['prospects_added']).toBe('number');
      expect(typeof entry['appointments_completed']).toBe('number');
      expect(typeof entry['sales_meetings']).toBe('number');
      expect(typeof entry['sales_successful']).toBe('number');
      expect(typeof entry['total_points']).toBe('number');
    }
  });

  it('groups entries have the correct shape with numeric counts', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats?period=mtd')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const { groups } = res.body.data as {
      individual: Record<string, unknown>[];
      groups: Record<string, unknown>[];
    };

    // Only assert shape when entries are present
    if (groups.length > 0) {
      const entry = groups[0];
      expect(entry).toHaveProperty('group_id');
      expect(entry).toHaveProperty('group_name');
      expect(entry).toHaveProperty('leader_name');
      expect(entry).toHaveProperty('member_count');
      expect(entry).toHaveProperty('prospects_added');
      expect(entry).toHaveProperty('appointments_completed');
      expect(entry).toHaveProperty('sales_meetings');
      expect(entry).toHaveProperty('sales_successful');
      expect(entry).toHaveProperty('total_points');

      expect(typeof entry['member_count']).toBe('number');
      expect(typeof entry['prospects_added']).toBe('number');
      expect(typeof entry['appointments_completed']).toBe('number');
      expect(typeof entry['sales_meetings']).toBe('number');
      expect(typeof entry['sales_successful']).toBe('number');
      expect(typeof entry['total_points']).toBe('number');
    }
  });
});

/******************************************************************************
  GET /api/leaderboard/stats — all roles permitted (agent vs admin)
******************************************************************************/

describe('GET /api/leaderboard/stats — all roles permitted', () => {
  it('returns 200 for an agent role (no 403)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/leaderboard/stats?period=mtd')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('individual');
    expect(res.body.data).toHaveProperty('groups');
  });

  it('agent sees global data (individual list includes more than just the authenticated agent)', async () => {
    expect(agentToken).not.toBeNull();

    const agentRes = await request(app)
      .get('/api/leaderboard/stats?period=mtd')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(agentRes.status).toBe(200);

    const agentIndividual = agentRes.body.data.individual as Record<string, unknown>[];

    // Agent sees global data — list includes more than just themselves
    expect(agentIndividual.length).toBeGreaterThan(1);
  });
});
