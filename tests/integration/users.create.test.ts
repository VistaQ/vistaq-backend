import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/users
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_GROUP_ID = '00000000-0000-4000-8000-000000000001';

/** Admin credentials used to obtain a token in beforeAll */
const ADMIN_EMAIL = 'jeremy.nathan1@gmail.com';
const ADMIN_PASSWORD = 'password';

/** The user being created in the happy path test */
const CREATE_EMAIL = 'Alejandra_Kuphal@gmail.com';
const CREATE_NAME = 'Orville Tremblay';
const CREATE_AGENT_CODE = 'AG003';

/** Agent code used for the non-admin token (AG004) */
const NON_ADMIN_AGENT_CODE = 'AG004';
const NON_ADMIN_EMAIL = `test.users.nonadmin.${Date.now()}@example.com`;
const NON_ADMIN_PASSWORD = 'Password1!';

/** Admin JWT obtained in beforeAll */
let adminToken: string | null = null;

/** Non-admin JWT obtained in beforeAll (agent role) */
let nonAdminToken: string | null = null;

/** Auth user ID created in the happy path test — used in afterAll cleanup */
let createdUserId: string | null = null;

/** Auth user ID for the non-admin temp agent created in beforeAll */
let nonAdminUserId: string | null = null;

/******************************************************************************
  beforeAll
******************************************************************************/

beforeAll(async () => {
  // Step 1 — Obtain an admin JWT by logging in
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (loginRes.status === 200 && loginRes.body?.data?.token) {
    adminToken = loginRes.body.data.token as string;
  }

  // Step 2 — Clean up any stale created user from a previous run
  try {
    const { data: staleUsers } = await supabaseService.adminSelect(
      'users',
      'id',
      { email: CREATE_EMAIL, tenant_id: TENANT_ID },
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

  // Step 3 — Reset AG003 to unused (best-effort, always run)
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: CREATE_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // Step 4 — Clean up any stale non-admin agent from previous runs
  try {
    const { data: staleNonAdmins } = await supabaseService.adminSelect(
      'users',
      'id',
      { agent_code: NON_ADMIN_AGENT_CODE, tenant_id: TENANT_ID },
    );
    for (const row of (staleNonAdmins ?? []) as unknown as { id: string }[]) {
      try {
        await supabaseService.adminDeleteAuthUser(row.id);
      } catch {
        try {
          await supabaseService.adminDelete('users', { id: row.id });
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }

  // Step 5 — Reset AG004
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: NON_ADMIN_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // Step 6 — Register a temp non-admin agent (AG004) for the 403 test
  const registerRes = await request(app)
    .post('/api/auth/register')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({
      fullName: 'Temp Non Admin Agent',
      agentCode: NON_ADMIN_AGENT_CODE,
      email: NON_ADMIN_EMAIL,
      password: NON_ADMIN_PASSWORD,
      groupId: VALID_GROUP_ID,
      location: 'Kuala Lumpur',
    });

  if (registerRes.status === 201 && registerRes.body?.data?.user?.id) {
    nonAdminUserId = registerRes.body.data.user.id as string;
    nonAdminToken = (registerRes.body.data.token as string) ?? null;
  }

  // If no token from register, fall back to login
  if (!nonAdminToken && nonAdminUserId) {
    const nonAdminLoginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: NON_ADMIN_EMAIL, password: NON_ADMIN_PASSWORD });

    if (nonAdminLoginRes.status === 200 && nonAdminLoginRes.body?.data?.token) {
      nonAdminToken = nonAdminLoginRes.body.data.token as string;
    }
  }
}, 30000);

/******************************************************************************
  afterAll
******************************************************************************/

afterAll(async () => {
  // Delete the user created in the happy path test
  if (createdUserId) {
    try {
      await supabaseService.adminDeleteAuthUser(createdUserId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: createdUserId });
      } catch { /* best-effort */ }
    }
  }

  // Reset AG003
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: CREATE_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // Delete the non-admin temp agent
  if (nonAdminUserId) {
    try {
      await supabaseService.adminDeleteAuthUser(nonAdminUserId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: nonAdminUserId });
      } catch { /* best-effort */ }
    }
  }

  // Reset AG004
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: NON_ADMIN_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }
});

/******************************************************************************
  Happy path
******************************************************************************/

describe('POST /api/users — happy path', () => {
  it('returns 201 with the created user and marks the agent code as used', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        email: CREATE_EMAIL,
        password: 'Password1!',
        role: 'agent',
        agentCode: CREATE_AGENT_CODE,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const { data } = res.body as { data: Record<string, unknown> };

    // Collect created user ID for afterAll cleanup
    if (data?.id) {
      createdUserId = data.id as string;
    }

    expect(data.email).toBe(CREATE_EMAIL);
    expect(data.name).toBe(CREATE_NAME);
    expect(data.role).toBe('agent');
    expect(data.agent_code).toBe(CREATE_AGENT_CODE);
    expect(data.tenant_id).toBe(TENANT_ID);

    // Verify RLS exercised — AG003 should now be used and linked to the new user
    const { data: agentCodes } = await supabaseService.adminSelect(
      'agent_codes',
      'agent_code, is_used, user_id',
      { agent_code: CREATE_AGENT_CODE, tenant_id: TENANT_ID },
    );

    const ag003 = (agentCodes as unknown as { agent_code: string; is_used: boolean; user_id: string | null }[])?.[0];
    expect(ag003).toBeDefined();
    expect(ag003.is_used).toBe(true);
    expect(ag003.user_id).toBe(createdUserId);
  });
});

/******************************************************************************
  Auth / role guard
******************************************************************************/

describe('POST /api/users — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({
        name: CREATE_NAME,
        email: 'other@example.com',
        password: 'Password1!',
        role: 'agent',
        agentCode: CREATE_AGENT_CODE,
      });

    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not an admin', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${nonAdminToken}`)
      .send({
        name: CREATE_NAME,
        email: 'other2@example.com',
        password: 'Password1!',
        role: 'agent',
        agentCode: CREATE_AGENT_CODE,
      });

    expect(res.status).toBe(403);
  });
});

/******************************************************************************
  Validation
******************************************************************************/

describe('POST /api/users — validation', () => {
  it('returns 400 with "Validation failed" when email is missing', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        password: 'Password1!',
        role: 'agent',
        agentCode: CREATE_AGENT_CODE,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with "Validation failed" when role is not a valid enum value', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        email: 'someuser@example.com',
        password: 'Password1!',
        role: 'superuser',
        agentCode: CREATE_AGENT_CODE,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with "Validation failed" when agentCode is omitted but role is agent', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        email: 'someagent@example.com',
        password: 'Password1!',
        role: 'agent',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with "Validation failed" when password does not meet requirements', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        email: 'weakpw@example.com',
        password: 'password',
        role: 'agent',
        agentCode: CREATE_AGENT_CODE,
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  Agent code validation
******************************************************************************/

describe('POST /api/users — agent code validation', () => {
  it('returns 400 with a message containing "agent code" when agentCode does not exist', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        email: 'badcode@example.com',
        password: 'Password1!',
        role: 'agent',
        agentCode: 'NONEXISTENT999',
      });

    expect(res.status).toBe(400);
    expect((res.body?.message as string ?? '').toLowerCase()).toContain('agent code');
  });

  it('returns 400 when agentCode is already in use', async () => {
    // Mark AG003 as used before calling the endpoint
    try {
      await supabaseService.adminUpdate(
        'agent_codes',
        { is_used: true, user_id: '00000000-0000-0000-0000-000000000099' },
        { agent_code: CREATE_AGENT_CODE, tenant_id: TENANT_ID },
      );
    } catch { /* best-effort */ }

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: CREATE_NAME,
        email: 'alreadyused@example.com',
        password: 'Password1!',
        role: 'agent',
        agentCode: CREATE_AGENT_CODE,
      });

    // Always reset AG003 after the test body, regardless of outcome
    try {
      await supabaseService.adminUpdate(
        'agent_codes',
        { is_used: false, user_id: null },
        { agent_code: CREATE_AGENT_CODE, tenant_id: TENANT_ID },
      );
    } catch { /* best-effort */ }

    expect(res.status).toBe(400);
  });
});
