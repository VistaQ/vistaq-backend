import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — GET /api/users/:userId
******************************************************************************/

const TENANT_SLUG = 'demo-agency';

/** Admin credentials used to obtain a token in beforeAll */
const ADMIN_EMAIL = 'admin@demo-agency.com';
const ADMIN_PASSWORD = 'password';

/** Admin JWT obtained in beforeAll */
let adminToken: string | null = null;

/** A valid user ID fetched from GET /api/users in beforeAll */
let existingUserId: string | null = null;

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

  // Fetch the user list to obtain a real ID for the happy-path test
  if (adminToken) {
    const usersRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    if (usersRes.status === 200 && Array.isArray(usersRes.body?.data) && usersRes.body.data.length > 0) {
      existingUserId = (usersRes.body.data[0] as { id: string }).id;
    }
  }
}, 30000);

/******************************************************************************
  Happy path
******************************************************************************/

describe('GET /api/users/:userId — happy path', () => {
  it('returns 200 with { success: true, data: IUser } when authenticated and user exists', async () => {
    const res = await request(app)
      .get(`/api/users/${existingUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const user = res.body.data as Record<string, unknown>;
    expect(user).toHaveProperty('id', existingUserId);
    expect(user).toHaveProperty('tenant_id');
    expect(user).toHaveProperty('email');
    expect(user).toHaveProperty('name');
    expect(user).toHaveProperty('role');
    expect(user).toHaveProperty('status');
    expect(user).toHaveProperty('created_at');
    expect(user).toHaveProperty('updated_at');
  });
});

/******************************************************************************
  Not found
******************************************************************************/

describe('GET /api/users/:userId — not found', () => {
  it('returns 404 when user does not exist', async () => {
    const res = await request(app)
      .get('/api/users/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  Auth guard
******************************************************************************/

describe('GET /api/users/:userId — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/users/user-001');

    expect(res.status).toBe(401);
  });
});
