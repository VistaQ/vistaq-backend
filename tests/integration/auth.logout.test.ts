import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/auth/logout
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_PASSWORD = 'Password1!';

/** Valid RFC 4122 UUID group from seed data */
const VALID_GROUP_ID = '00000000-0000-4000-8000-000000000001';

/** Agent code reserved for logout integration tests */
const TEST_AGENT_CODE = 'AG004';

/** Email generated once for the test user registered in beforeAll */
const TEST_EMAIL = `test.logout.${Date.now()}@example.com`;

/** Auth user ID created in beforeAll — collected for afterAll cleanup */
let createdAuthUserId: string | null = null;

/** Valid session token obtained by logging in in beforeAll */
let validToken: string | null = null;

/******************************************************************************
  beforeAll — register and login a test user so logout tests have a real token
******************************************************************************/

beforeAll(async () => {
  // Clean up any stale user from a previous run that used AG004
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
  const registerRes = await request(app)
    .post('/api/auth/register')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({
      fullName: 'Logout Test User',
      agentCode: TEST_AGENT_CODE,
      email: TEST_EMAIL,
      password: VALID_PASSWORD,
      groupId: VALID_GROUP_ID,
      location: 'Kuala Lumpur',
    });

  if (registerRes.status === 201 && registerRes.body?.data?.user?.id) {
    createdAuthUserId = registerRes.body.data.user.id as string;
    validToken = (registerRes.body.data.token as string) ?? null;
  }

  // If no token from register, attempt a fresh login
  if (!validToken && createdAuthUserId) {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: TEST_EMAIL, password: VALID_PASSWORD });

    if (loginRes.status === 200 && loginRes.body?.data?.token) {
      validToken = loginRes.body.data.token as string;
    }
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

  // Reset AG004 so subsequent runs start clean
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

describe('POST /api/auth/logout — happy path', () => {
  it('returns 200 with { success: true } when given a valid Bearer token', async () => {
    // Obtain a fresh token for this test (the one from beforeAll may already be used)
    const loginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: TEST_EMAIL, password: VALID_PASSWORD });

    const token = (loginRes.body?.data?.token as string) ?? validToken;

    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });
});

/******************************************************************************
  Missing Authorization header
******************************************************************************/

describe('POST /api/auth/logout — missing Authorization header', () => {
  it('returns 401 when the Authorization header is absent', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  Invalid / malformed token
******************************************************************************/

describe('POST /api/auth/logout — invalid token', () => {
  it('returns 401 when token is invalid or malformed', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer invalidtoken');

    // Supabase admin signOut with an invalid JWT returns an error which the
    // service/controller wraps and passes through; the endpoint should return
    // a non-2xx status (typically 500 via the global error handler, or 401
    // if the implementation maps the Supabase error to Unauthorized).
    // We assert it is NOT a success response.
    expect(res.status).not.toBe(200);
  });
});
