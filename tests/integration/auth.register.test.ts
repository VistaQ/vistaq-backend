import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/auth/register
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const VALID_PASSWORD = 'Password1!';

/**
 * A valid RFC 4122 UUID for a test group that we insert in beforeAll.
 * The seeded groups use non-standard UUIDs that fail Zod's strict uuid() check,
 * so we create a properly-formed UUID group for these tests.
 */
const TEST_GROUP_ID = 'a1b2c3d4-0000-4000-8000-000000000001';

/** Unique email generator to avoid conflicts between test runs */
const uniqueEmail = (tag: string) => `test.${tag}.${Date.now()}@example.com`;

/** Registered auth user IDs collected for cleanup in afterAll */
const createdAuthUserIds: string[] = [];

/** Agent codes used during this run that need to be reset in afterAll */
const usedAgentCodes: string[] = [];

/** Whether the test group was created and needs to be deleted in afterAll */
let testGroupCreated = false;

/******************************************************************************
  beforeAll — create a valid-UUID group for the tests
******************************************************************************/

beforeAll(async () => {
  // Clean up any stale users from previous test runs that share our agent codes.
  // This makes the suite idempotent regardless of whether afterAll ran cleanly before.
  const staleAgentCodes = ['AG005', 'AG002'];
  for (const agentCode of staleAgentCodes) {
    // Delete stale users — each deletion is isolated so one failure doesn't block the rest
    try {
      const { data: staleUsers } = await supabaseService.adminSelect(
        'users',
        'id',
        { agent_code: agentCode, tenant_id: TENANT_ID },
      );
      for (const row of (staleUsers ?? []) as unknown as { id: string }[]) {
        try {
          await supabaseService.adminDeleteAuthUser(row.id);
        } catch {
          // Auth user may already be gone — delete the public.users row directly
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
        { agent_code: agentCode, tenant_id: TENANT_ID },
      );
    } catch { /* best-effort */ }
  }

  // Create a valid-UUID group for registration tests
  const { error } = await supabaseService.adminInsert('groups', {
    id: TEST_GROUP_ID,
    tenant_id: TENANT_ID,
    name: 'Test Group (integration)',
    status: 'active',
  });

  if (!error) {
    testGroupCreated = true;
  }
});

/******************************************************************************
  Minimal valid request body factory
******************************************************************************/

const validBody = (overrides: Record<string, unknown> = {}) => ({
  fullName: 'Test Agent',
  agentCode: 'AG005',
  email: uniqueEmail('ag005'),
  password: VALID_PASSWORD,
  groupId: TEST_GROUP_ID,
  location: 'Kuala Lumpur',
  ...overrides,
});

/******************************************************************************
  afterAll — clean up created users, reset agent codes, remove test group
******************************************************************************/

afterAll(async () => {
  // Delete all users created during the test run.
  // Try auth deletion first (cascades to public.users).
  // If that fails, delete the public.users row directly so the agent code
  // unique constraint doesn't block subsequent test runs.
  for (const userId of createdAuthUserIds) {
    try {
      await supabaseService.adminDeleteAuthUser(userId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: userId });
      } catch { /* best-effort */ }
    }
  }

  // Reset agent codes so subsequent runs start from a clean state
  for (const agentCode of usedAgentCodes) {
    try {
      await supabaseService.adminUpdate(
        'agent_codes',
        { is_used: false, user_id: null },
        { agent_code: agentCode },
      );
    } catch {
      // Best-effort
    }
  }

  // Remove the test group created in beforeAll
  if (testGroupCreated) {
    try {
      await supabaseService.adminDelete('groups', { id: TEST_GROUP_ID });
    } catch {
      // Best-effort
    }
  }
});

/******************************************************************************
  Happy path
******************************************************************************/

describe('POST /api/auth/register — happy path', () => {
  it('creates a user and returns 201 with the expected shape', async () => {
    const email = uniqueEmail('ag005');

    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(validBody({ agentCode: 'AG005', email }));

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const { data } = res.body as {
      data: { user: Record<string, unknown>; token: string | null };
    };

    // Track for cleanup
    if (data?.user?.id) {
      createdAuthUserIds.push(data.user.id as string);
      usedAgentCodes.push('AG005');
    }

    expect(data).toHaveProperty('user');
    expect(data).toHaveProperty('token');

    // Token is string or null
    expect(
      typeof data.token === 'string' || data.token === null,
    ).toBe(true);

    const { user } = data;
    expect(user.email).toBe(email);
    expect(user.role).toBe('agent');
    expect(user.tenant_id).toBe(TENANT_ID);
  });
});

/******************************************************************************
  Missing X-Tenant-Slug header
******************************************************************************/

describe('POST /api/auth/register — missing X-Tenant-Slug header', () => {
  it('returns 400 when the X-Tenant-Slug header is absent', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(validBody({ agentCode: 'AG003', email: uniqueEmail('no-header') }));

    expect(res.status).toBe(400);
  });
});

/******************************************************************************
  Invalid tenant slug
******************************************************************************/

describe('POST /api/auth/register — invalid tenant slug', () => {
  it('returns 404 when the tenant does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', 'nonexistent-tenant')
      .send(validBody({ agentCode: 'AG003', email: uniqueEmail('bad-tenant') }));

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  Invalid agent code (doesn't exist)
******************************************************************************/

describe('POST /api/auth/register — invalid agent code', () => {
  it('returns 400 when the agent code does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(validBody({ agentCode: 'INVALID999', email: uniqueEmail('bad-code') }));

    expect(res.status).toBe(400);
  });
});

/******************************************************************************
  Agent code already used
******************************************************************************/

describe('POST /api/auth/register — agent code already used', () => {
  it('returns 400 on the second registration with the same agent code', async () => {
    const firstEmail = uniqueEmail('ag002-first');

    // First registration — should succeed
    const firstRes = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(validBody({ agentCode: 'AG002', email: firstEmail }));

    expect(firstRes.status).toBe(201);

    const firstData = firstRes.body?.data as {
      user: Record<string, unknown>;
      token: string | null;
    } | undefined;

    if (firstData?.user?.id) {
      createdAuthUserIds.push(firstData.user.id as string);
      usedAgentCodes.push('AG002');
    }

    // Second registration with the same agent code — should fail
    const secondRes = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(
        validBody({ agentCode: 'AG002', email: uniqueEmail('ag002-second') }),
      );

    expect(secondRes.status).toBe(400);
  });
});

/******************************************************************************
  Weak password — no uppercase
******************************************************************************/

describe('POST /api/auth/register — weak password (no uppercase)', () => {
  it('returns 400 with message "Validation failed"', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(
        validBody({
          agentCode: 'AG003',
          email: uniqueEmail('weak-pw-no-upper'),
          password: 'password1!',
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  Weak password — no special character
******************************************************************************/

describe('POST /api/auth/register — weak password (no special character)', () => {
  it('returns 400 with message "Validation failed"', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(
        validBody({
          agentCode: 'AG003',
          email: uniqueEmail('weak-pw-no-special'),
          password: 'Password1',
        }),
      );

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  Missing required field — email
******************************************************************************/

describe('POST /api/auth/register — missing required field (email)', () => {
  it('returns 400 with message "Validation failed"', async () => {
    const body = validBody({ agentCode: 'AG003' });
    // Remove email entirely
    const { email: _email, ...bodyWithoutEmail } = body as typeof body & { email?: string };

    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send(bodyWithoutEmail);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});
