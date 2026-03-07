import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/auth/login
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_PASSWORD = 'Password1!';

/** Valid RFC 4122 UUID group from seed data */
const VALID_GROUP_ID = '00000000-0000-4000-8000-000000000001';

/** Agent code reserved for login integration tests */
const TEST_AGENT_CODE = 'AG003';

/** Email generated once for the test user registered in beforeAll */
const TEST_EMAIL = `test.login.${Date.now()}@example.com`;

/** Auth user ID created in beforeAll — collected for afterAll cleanup */
let createdAuthUserId: string | null = null;

/******************************************************************************
  beforeAll — register a test user so login tests have a real account
******************************************************************************/

beforeAll(async () => {
  // Clean up any stale user from a previous run that used AG003
  try {
    const { data: staleUsers } = await supabaseService.adminSelect(
      'users',
      'id',
      { agent_code: TEST_AGENT_CODE, tenant_id: TENANT_ID },
    );
    for (const row of (staleUsers ?? []) as unknown as { id: string }[]) {
      try {
        await supabaseService.adminDeleteAuthUser(row.id);
      } catch {
        try {
          await supabaseService.adminDelete('users', { id: row.id });
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }

  // Always reset the agent code regardless of whether user cleanup succeeded
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: TEST_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // Register the test user via the real endpoint
  const res = await request(app)
    .post('/api/auth/register')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({
      fullName: 'Login Test User',
      agentCode: TEST_AGENT_CODE,
      email: TEST_EMAIL,
      password: VALID_PASSWORD,
      groupId: VALID_GROUP_ID,
      location: 'Kuala Lumpur',
    });

  if (res.status === 201 && res.body?.data?.user?.id) {
    createdAuthUserId = res.body.data.user.id as string;
  }
});

/******************************************************************************
  afterAll — delete auth user and reset agent code
******************************************************************************/

afterAll(async () => {
  if (createdAuthUserId) {
    try {
      await supabaseService.adminDeleteAuthUser(createdAuthUserId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: createdAuthUserId });
      } catch { /* best-effort */ }
    }
  }

  // Reset AG003 so subsequent runs start clean
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: TEST_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch {
    // Best-effort
  }
});

/******************************************************************************
  Happy path
******************************************************************************/

describe('POST /api/auth/login — happy path', () => {
  it('returns 200 with { success: true, data: { user, token } }', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: TEST_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const { data } = res.body as {
      data: { user: Record<string, unknown>; token: string };
    };

    expect(data).toHaveProperty('user');
    expect(data).toHaveProperty('token');
    expect(typeof data.token).toBe('string');
    expect(data.token.length).toBeGreaterThan(0);

    expect(data.user.email).toBe(TEST_EMAIL);
    expect(data.user.role).toBe('agent');
  });
});

/******************************************************************************
  Missing X-Tenant-Slug header
******************************************************************************/

describe('POST /api/auth/login — missing X-Tenant-Slug header', () => {
  it('returns 400 when the X-Tenant-Slug header is absent', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(400);
  });
});

/******************************************************************************
  Invalid tenant slug
******************************************************************************/

describe('POST /api/auth/login — invalid tenant slug', () => {
  it('returns 404 when the tenant does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', 'nonexistent-tenant')
      .send({ email: TEST_EMAIL, password: VALID_PASSWORD });

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  Wrong password
******************************************************************************/

describe('POST /api/auth/login — wrong password', () => {
  it('returns 400 with message "Invalid credentials"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: TEST_EMAIL, password: 'WrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Invalid credentials');
  });
});

/******************************************************************************
  Wrong email
******************************************************************************/

describe('POST /api/auth/login — wrong email', () => {
  it('returns 400 with message "Invalid credentials"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: `nonexistent.${Date.now()}@example.com`, password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Invalid credentials');
  });
});

/******************************************************************************
  Tenant mismatch
******************************************************************************/

describe('POST /api/auth/login — tenant mismatch', () => {
  // This test requires a second tenant to exist in the database.
  // Without a second tenant, there is no way to authenticate a valid user
  // and then present a mismatched tenant slug — skip unless one exists.
  it.skip('returns 400 when user exists but belongs to a different tenant', async () => {
    // To enable: set SECOND_TENANT_SLUG to a slug that exists in the database
    // but is not the tenant that TEST_EMAIL belongs to.
    // const SECOND_TENANT_SLUG = 'second-agency';
    // const res = await request(app)
    //   .post('/api/auth/login')
    //   .set('X-Tenant-Slug', SECOND_TENANT_SLUG)
    //   .send({ email: TEST_EMAIL, password: VALID_PASSWORD });
    // expect(res.status).toBe(400);
    // expect(res.body).toHaveProperty('message', 'Invalid credentials');
  });
});

/******************************************************************************
  Invalid email format in body (validation)
******************************************************************************/

describe('POST /api/auth/login — invalid email format', () => {
  it('returns 400 with message "Validation failed"', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: 'not-an-email', password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});
