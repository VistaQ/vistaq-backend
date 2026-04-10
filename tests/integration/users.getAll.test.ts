import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — GET /api/users
******************************************************************************/

const TENANT_SLUG = 'demo-agency';

/** Admin credentials used to obtain a token in beforeAll */
const ADMIN_EMAIL = 'jeremy.nathan1@gmail.com';
const ADMIN_PASSWORD = 'password';

/** Admin JWT obtained in beforeAll */
let adminToken: string | null = null;

/******************************************************************************
  beforeAll
******************************************************************************/

beforeAll(async () => {
  // Obtain an admin JWT by logging in
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (loginRes.status === 200 && loginRes.body?.data?.token) {
    adminToken = loginRes.body.data.token as string;
  }
}, 30000);

/******************************************************************************
  Happy path
******************************************************************************/

describe('GET /api/users — happy path', () => {
  it('returns 200 with { success: true, data: [...] } when authenticated', async () => {
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);

    // Verify each user object has the expected shape
    if (res.body.data.length > 0) {
      const user = res.body.data[0] as Record<string, unknown>;
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('tenant_id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('status');
      expect(user).toHaveProperty('created_at');
      expect(user).toHaveProperty('updated_at');
    }
  });
});

/******************************************************************************
  Auth guard
******************************************************************************/

describe('GET /api/users — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/users');

    expect(res.status).toBe(401);
  });
});
