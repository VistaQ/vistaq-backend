import path from 'path';
import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — Taxonomies CRUD
    GET    /api/taxonomies        (all roles)
    POST   /api/taxonomies        (admin only)
    PUT    /api/taxonomies/:id     (admin only)
    DELETE /api/taxonomies/:id     (admin only)

  NOTE: Cross-tenant isolation is enforced by RLS plus the service-layer tenant
  filter, but it is NOT exercised here: the seed fixtures define a single tenant
  (per project decision), so there is no second tenant to assert against.
******************************************************************************/

// Credentials are sourced from the seed manifest written by scripts/bootstrap.js.
const manifest = require(path.join(
  __dirname,
  '../../scripts/seed-manifest.json',
)) as {
  tenantSlug: string;
  adminPassword: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
};

const TENANT_SLUG = manifest.tenantSlug;

const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = manifest.adminPassword;

const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;
const AGENT_PASSWORD = manifest.password;

const NON_EXISTENT_ID = '00000000-0000-0000-0000-000000000000';

// Unique types per run so this suite is independent and self-cleaning.
const RUN = Date.now();
const TYPE = `test_product_${RUN}`;
const TYPE_ORDER = `test_order_${RUN}`;
const TYPE_EMPTY = `test_empty_${RUN}`;

let adminToken: string | null = null;
let agentToken: string | null = null;

/** Track every taxonomy id created by the test so afterAll can clean them up. */
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
  afterAll — delete every taxonomy created by the test (best-effort)
******************************************************************************/

afterAll(async () => {
  for (const id of createdIds) {
    if (!id) continue;
    try {
      await supabaseService.adminDelete('taxonomies', { id });
    } catch {
      // best-effort
    }
  }
});

/******************************************************************************
  POST /api/taxonomies — happy path
******************************************************************************/

describe('POST /api/taxonomies — happy path', () => {
  it('returns 201 with the created taxonomy when admin creates a value', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: 'Whole Life', sort_order: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const data = res.body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('tenant_id');
    expect(data).toHaveProperty('type', TYPE);
    expect(data).toHaveProperty('value', 'Whole Life');
    expect(data).toHaveProperty('sort_order', 3);
    expect(data).toHaveProperty('created_at');
    expect(data).toHaveProperty('updated_at');

    track(data['id'] as string);
  });
});

/******************************************************************************
  GET /api/taxonomies — ordering, access, optional filter, validation
******************************************************************************/

describe('GET /api/taxonomies — ordering', () => {
  it('returns values ordered by sort_order asc then value asc', async () => {
    expect(adminToken).not.toBeNull();

    // Insert deliberately out of order: Banana[2], Apple[1], Cherry[1].
    const rows = [
      { value: 'Banana', sort_order: 2 },
      { value: 'Apple', sort_order: 1 },
      { value: 'Cherry', sort_order: 1 },
    ];

    for (const row of rows) {
      const res = await request(app)
        .post('/api/taxonomies')
        .set('Authorization', adminAuth())
        .send({ type: TYPE_ORDER, ...row });
      expect(res.status).toBe(201);
      track(res.body.data.id as string);
    }

    const getRes = await request(app)
      .get(`/api/taxonomies?type=${TYPE_ORDER}`)
      .set('Authorization', adminAuth());

    expect(getRes.status).toBe(200);
    expect(getRes.body.success).toBe(true);
    expect(Array.isArray(getRes.body.data)).toBe(true);

    const values = (getRes.body.data as { value: string }[]).map((r) => r.value);
    // sort_order asc then value asc → Apple[1], Cherry[1], Banana[2]
    expect(values).toEqual(['Apple', 'Cherry', 'Banana']);
  });
});

describe('GET /api/taxonomies — access', () => {
  it('is accessible to a non-admin role (agent) → 200 with an array', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get(`/api/taxonomies?type=${TYPE_ORDER}`)
      .set('Authorization', agentAuth());

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/taxonomies — optional type filter', () => {
  it('returns an array (>= created rows) when no type filter is supplied', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/taxonomies')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // At minimum the four rows created so far (1 base + 3 ordering) are present.
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
  });

  it('returns an empty array for a type that has no rows', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get(`/api/taxonomies?type=${TYPE_EMPTY}`)
      .set('Authorization', adminAuth());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /api/taxonomies — query validation', () => {
  it('returns 400 when type is an empty string', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/taxonomies?type=')
      .set('Authorization', adminAuth());

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('GET /api/taxonomies — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/taxonomies');
    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  POST /api/taxonomies — duplicate / validation / guards
******************************************************************************/

describe('POST /api/taxonomies — duplicate', () => {
  it('returns 409 when the same (type, value) is created twice', async () => {
    expect(adminToken).not.toBeNull();

    const value = `Dup-${RUN}`;

    const first = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value });

    expect(first.status).toBe(201);
    track(first.body.data.id as string);

    const second = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value });

    expect(second.status).toBe(409);
  });
});

describe('POST /api/taxonomies — body validation', () => {
  it('returns 400 when value is missing', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when value is an empty string', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: '' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when the body contains an unknown key (strict schema)', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: 'Term Life', extra: 'nope' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('POST /api/taxonomies — guards', () => {
  it('returns 403 for a non-admin role (agent) with a valid body', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', agentAuth())
      .send({ type: TYPE, value: `Agent-${RUN}` });

    expect(res.status).toBe(403);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/taxonomies')
      .send({ type: TYPE, value: `NoAuth-${RUN}` });

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  PUT /api/taxonomies/:id — happy path / validation / guards / not found
******************************************************************************/

describe('PUT /api/taxonomies/:id — happy path', () => {
  it('returns 200 and reflects the updated value and sort_order', async () => {
    expect(adminToken).not.toBeNull();

    const createRes = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: `ToUpdate-${RUN}`, sort_order: 5 });

    expect(createRes.status).toBe(201);
    const id = track(createRes.body.data.id as string);

    const newValue = `Updated-${RUN}`;
    const res = await request(app)
      .put(`/api/taxonomies/${id}`)
      .set('Authorization', adminAuth())
      .send({ value: newValue, sort_order: 9 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const data = res.body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id', id);
    expect(data).toHaveProperty('value', newValue);
    expect(data).toHaveProperty('sort_order', 9);
    expect(data).toHaveProperty('type', TYPE);
  });
});

describe('PUT /api/taxonomies/:id — body validation', () => {
  it('returns 400 for an empty body (no value or sort_order)', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put(`/api/taxonomies/${NON_EXISTENT_ID}`)
      .set('Authorization', adminAuth())
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('PUT /api/taxonomies/:id — guards', () => {
  it('returns 403 for a non-admin role (agent) with a valid body', async () => {
    expect(agentToken).not.toBeNull();

    const createRes = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: `PutGuard-${RUN}` });
    expect(createRes.status).toBe(201);
    const id = track(createRes.body.data.id as string);

    const res = await request(app)
      .put(`/api/taxonomies/${id}`)
      .set('Authorization', agentAuth())
      .send({ value: 'X' });

    expect(res.status).toBe(403);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .put(`/api/taxonomies/${NON_EXISTENT_ID}`)
      .send({ value: 'X' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/taxonomies/:id — not found', () => {
  it('returns 404 for a non-existent id within the tenant', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put(`/api/taxonomies/${NON_EXISTENT_ID}`)
      .set('Authorization', adminAuth())
      .send({ value: `Ghost-${RUN}` });

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  DELETE /api/taxonomies/:id — happy path / guards / not found
******************************************************************************/

describe('DELETE /api/taxonomies/:id — guards', () => {
  it('returns 403 for a non-admin role (agent)', async () => {
    expect(agentToken).not.toBeNull();

    const createRes = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: `DeleteGuard-${RUN}` });
    expect(createRes.status).toBe(201);
    const id = track(createRes.body.data.id as string);

    const res = await request(app)
      .delete(`/api/taxonomies/${id}`)
      .set('Authorization', agentAuth());

    expect(res.status).toBe(403);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).delete(`/api/taxonomies/${NON_EXISTENT_ID}`);
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/taxonomies/:id — not found', () => {
  it('returns 404 for a non-existent id within the tenant', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .delete(`/api/taxonomies/${NON_EXISTENT_ID}`)
      .set('Authorization', adminAuth());

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/taxonomies/:id — happy path', () => {
  it('returns 204 and the row is gone afterwards', async () => {
    expect(adminToken).not.toBeNull();

    const createRes = await request(app)
      .post('/api/taxonomies')
      .set('Authorization', adminAuth())
      .send({ type: TYPE, value: `Throwaway-${RUN}` });
    expect(createRes.status).toBe(201);

    const id = createRes.body.data.id as string;
    const trackIndex = createdIds.push(id) - 1;

    const delRes = await request(app)
      .delete(`/api/taxonomies/${id}`)
      .set('Authorization', adminAuth());

    expect(delRes.status).toBe(204);
    expect(delRes.body).toEqual({});

    // Null out the tracking entry so afterAll does not double-delete.
    createdIds[trackIndex] = null;

    // Confirm it is gone via a filtered GET.
    const getRes = await request(app)
      .get(`/api/taxonomies?type=${TYPE}`)
      .set('Authorization', adminAuth());

    expect(getRes.status).toBe(200);
    const found = (getRes.body.data as { id: string }[]).find(
      (r) => r.id === id,
    );
    expect(found).toBeUndefined();
  });
});
