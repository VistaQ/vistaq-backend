import path from 'path';
import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — GET /api/agent-points
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

// Seeded agent — used for own-data queries and 403 checks
const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;
const AGENT_ID = manifest.users.mdrt_stars_agent.id;
const AGENT_PASSWORD = manifest.password;

// A different agent from another group — used for 403 cross-user checks
const OTHER_AGENT_ID = manifest.users.kpi_busters_agent.id;

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
  GET /api/agent-points — auth guard
******************************************************************************/

describe('GET /api/agent-points — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/agent-points');

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  GET /api/agent-points — validation errors
******************************************************************************/

describe('GET /api/agent-points — validation errors', () => {
  it('returns 400 when page is 0', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?page=0')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when limit is 0', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?limit=0')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when limit exceeds 100', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?limit=101')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when userId is not a valid UUID', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?userId=not-a-uuid')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  GET /api/agent-points — role guard (403)
******************************************************************************/

describe('GET /api/agent-points — role guard', () => {
  it('returns 403 when an agent passes a userId that differs from their own', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get(`/api/agent-points?userId=${OTHER_AGENT_ID}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(403);
  });
});

/******************************************************************************
  GET /api/agent-points — happy path (agent — own points)
******************************************************************************/

describe('GET /api/agent-points — happy path (agent, own points)', () => {
  it('returns 200 with success true and the correct top-level shape', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const { data } = res.body;
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('categories');
    expect(data).toHaveProperty('breakdown');
    expect(data).toHaveProperty('pagination');
  });

  it('returns numeric total and category totals', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(typeof data.total).toBe('number');

    const { categories } = data;
    expect(typeof categories.prospect).toBe('number');
    expect(typeof categories.sales).toBe('number');
    expect(typeof categories.coaching).toBe('number');
  });

  it('returns a breakdown array', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.breakdown)).toBe(true);
  });

  it('returns breakdown items with the correct shape when entries are present', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);

    const breakdown = res.body.data.breakdown as Record<string, unknown>[];

    if (breakdown.length > 0) {
      const item = breakdown[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('date');
      expect(item).toHaveProperty('category');
      expect(item).toHaveProperty('action');
      expect(item).toHaveProperty('subject');
      expect(item).toHaveProperty('points');
      expect(typeof item['points']).toBe('number');
    }
  });

  it('returns a pagination object with the correct shape', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);

    const { pagination } = res.body.data;
    expect(pagination).toHaveProperty('page', 1);
    expect(pagination).toHaveProperty('limit', 20);
    expect(typeof pagination.total_count).toBe('number');
    expect(typeof pagination.total_pages).toBe('number');
  });

  it('returns 200 when agent explicitly passes their own userId', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get(`/api/agent-points?userId=${AGENT_ID}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});

/******************************************************************************
  GET /api/agent-points — happy path (no point_transactions data)
******************************************************************************/

describe('GET /api/agent-points — zero state', () => {
  it('returns zeros and an empty breakdown when the agent has no point transactions', async () => {
    expect(adminToken).not.toBeNull();

    // Query a seeded agent that is unlikely to have point transactions.
    // We use kpi_busters_agent via the admin token to avoid a 403.
    const res = await request(app)
      .get(`/api/agent-points?userId=${OTHER_AGENT_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // The endpoint should always return 200 regardless of whether data exists
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const { data } = res.body;
    expect(typeof data.total).toBe('number');
    expect(typeof data.categories.prospect).toBe('number');
    expect(typeof data.categories.sales).toBe('number');
    expect(typeof data.categories.coaching).toBe('number');
    expect(Array.isArray(data.breakdown)).toBe(true);

    // If the agent has no transactions the totals should be 0
    if (data.total === 0) {
      expect(data.categories.prospect).toBe(0);
      expect(data.categories.sales).toBe(0);
      expect(data.categories.coaching).toBe(0);
      expect(data.breakdown).toHaveLength(0);
    }
  });
});

/******************************************************************************
  GET /api/agent-points — pagination
******************************************************************************/

describe('GET /api/agent-points — pagination', () => {
  it('respects the page query param', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?page=2&limit=5')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toHaveProperty('page', 2);
    expect(res.body.data.pagination).toHaveProperty('limit', 5);
  });

  it('respects the limit query param', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?limit=10')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);

    const { pagination, breakdown } = res.body.data;
    expect(pagination).toHaveProperty('limit', 10);
    // breakdown must not exceed the requested limit
    expect((breakdown as unknown[]).length).toBeLessThanOrEqual(10);
  });

  it('returns correct total_pages based on total_count and limit', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/agent-points?page=1&limit=5')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);

    const { pagination } = res.body.data;
    const expectedPages = Math.ceil(pagination.total_count / pagination.limit);
    expect(pagination.total_pages).toBe(expectedPages);
  });
});

/******************************************************************************
  GET /api/agent-points — manager cross-user query
******************************************************************************/

describe('GET /api/agent-points — manager cross-user query', () => {
  it('returns 200 for an admin querying another user\'s points', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get(`/api/agent-points?userId=${AGENT_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('categories');
    expect(res.body.data).toHaveProperty('breakdown');
    expect(res.body.data).toHaveProperty('pagination');
  });

  it('returns 200 for a trainer querying an agent\'s points', async () => {
    // Log in as the mdrt_stars trainer
    const trainerRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: manifest.users.mdrt_stars_trainer.email, password: AGENT_PASSWORD });

    expect(trainerRes.status).toBe(200);
    const trainerToken = trainerRes.body.data.token as string;

    const res = await request(app)
      .get(`/api/agent-points?userId=${AGENT_ID}`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('returns 200 for a group_leader querying an agent\'s points', async () => {
    // Log in as the mdrt_stars group leader
    const leaderRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: manifest.users.mdrt_stars_leader.email, password: AGENT_PASSWORD });

    expect(leaderRes.status).toBe(200);
    const leaderToken = leaderRes.body.data.token as string;

    const res = await request(app)
      .get(`/api/agent-points?userId=${AGENT_ID}`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });
});
