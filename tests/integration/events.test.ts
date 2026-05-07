import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/events, PUT /api/events/:eventId,
                GET /api/events,   GET /api/events/:eventId
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Seeded group UUIDs (see supabase/seed.sql).
 * Both are valid RFC 4122 UUIDs that pass Zod's uuid() check.
 */
const GROUP_ID_ALPHA = '00000000-0000-4000-8000-000000000001'; // Alpha Team
const GROUP_ID_BETA = '00000000-0000-4000-8000-000000000002';  // Beta Team

/** Admin account — must exist in the running local Supabase instance */
const ADMIN_EMAIL = 'admin@demo-agency.com';
const ADMIN_PASSWORD = 'password';

/**
 * Agent account — created in beforeAll via POST /api/auth/register.
 * Agent role is NOT in ALLOWED_ROLES for events, so it is used for 403 checks.
 * Uses agent code AG001 (seeded, unused).
 */
const AGENT_EMAIL = `test.events.agent.${Date.now()}@example.com`;
const AGENT_PASSWORD = 'Password1!';
const AGENT_AGENT_CODE = 'AG001';

/**
 * Trainer account — created in beforeAll via POST /api/users (admin creates it).
 * Trainer role is in ALLOWED_ROLES but has additional group-ownership checks.
 * We register with agent code AG005 (seeded, unused).
 */
const TRAINER_EMAIL = `test.events.trainer.${Date.now()}@example.com`;
const TRAINER_PASSWORD = 'Password1!';
const TRAINER_AGENT_CODE = 'AG005';

let adminToken: string | null = null;
let agentToken: string | null = null;
let trainerToken: string | null = null;

/** ID of the admin user — looked up in beforeAll for agentIds invalid-role tests */
let adminUserId: string | null = null;

/** ID of the agent user created in beforeAll — deleted in afterAll */
let agentUserId: string | null = null;

/** ID of the trainer user created in beforeAll — deleted in afterAll */
let trainerUserId: string | null = null;

/** IDs of events created during the test run — deleted in afterAll */
const createdEventIds: string[] = [];

/** A future ISO 8601 datetime string with UTC timezone, always at least N days ahead */
function futureDate(offsetDays = 1): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString();
}

/** A future ISO 8601 end datetime string, offset by extra hours from start */
function futureDateEnd(offsetDays = 1, extraHours = 2): string {
  return new Date(Date.now() + offsetDays * 86400000 + extraHours * 3600000).toISOString();
}

/** A past ISO 8601 datetime string with UTC timezone */
function pastDate(offsetDays = 1): string {
  return new Date(Date.now() - offsetDays * 86400000).toISOString();
}

/******************************************************************************
  beforeAll — obtain tokens and provision a trainer user
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

  // ── 2. Look up admin user ID (for invalid-role agentIds tests) ───────────────
  try {
    const { data: adminUsers } = await supabaseService.adminSelect(
      'users',
      'id',
      { email: ADMIN_EMAIL, tenant_id: TENANT_ID },
    );
    if (adminUsers && (adminUsers as unknown as { id: string }[]).length > 0) {
      adminUserId = (adminUsers as unknown as { id: string }[])[0].id;
    }
  } catch { /* best-effort */ }

  // ── 3. Clean up any stale agent from a previous run ────────────────────────
  try {
    const { data: staleAgents } = await supabaseService.adminSelect(
      'users',
      'id',
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
    for (const row of (staleAgents ?? []) as unknown as { id: string }[]) {
      try {
        await supabaseService.adminDeleteAuthUser(row.id);
      } catch {
        try {
          await supabaseService.adminDelete('users', { id: row.id });
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }

  // Reset AG001
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // ── 4. Register an agent user for 403 / read tests ─────────────────────────
  const agentRegisterRes = await request(app)
    .post('/api/auth/register')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({
      fullName: 'Test Events Agent',
      agentCode: AGENT_AGENT_CODE,
      email: AGENT_EMAIL,
      password: AGENT_PASSWORD,
      groupId: GROUP_ID_ALPHA,
      location: 'Kuala Lumpur',
    });

  if (agentRegisterRes.status === 201 && agentRegisterRes.body?.data?.user?.id) {
    agentUserId = agentRegisterRes.body.data.user.id as string;
    agentToken = (agentRegisterRes.body.data.token as string) ?? null;
  }

  // Fall back to login if token was not returned by register
  if (!agentToken && agentUserId) {
    const agentLoginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: AGENT_EMAIL, password: AGENT_PASSWORD });

    if (agentLoginRes.status === 200 && agentLoginRes.body?.data?.token) {
      agentToken = agentLoginRes.body.data.token as string;
    }
  }

  // ── 5. Clean up any stale trainer from a previous run ──────────────────────
  try {
    const { data: staleTrainers } = await supabaseService.adminSelect(
      'users',
      'id',
      { agent_code: TRAINER_AGENT_CODE, tenant_id: TENANT_ID },
    );
    for (const row of (staleTrainers ?? []) as unknown as { id: string }[]) {
      try {
        await supabaseService.adminDeleteAuthUser(row.id);
      } catch {
        try {
          await supabaseService.adminDelete('users', { id: row.id });
        } catch { /* best-effort */ }
      }
    }
  } catch { /* best-effort */ }

  // Reset AG005
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: TRAINER_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // ── 6. Create a trainer user (admin-only POST /api/users) ───────────────────
  if (adminToken) {
    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Events Trainer',
        email: TRAINER_EMAIL,
        password: TRAINER_PASSWORD,
        role: 'trainer',
        agentCode: TRAINER_AGENT_CODE,
      });

    if (createRes.status === 201 && createRes.body?.data?.id) {
      trainerUserId = createRes.body.data.id as string;
    }

    // Log in as trainer to obtain a token
    const trainerLoginRes = await request(app)
      .post('/api/auth/login')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: TRAINER_EMAIL, password: TRAINER_PASSWORD });

    if (trainerLoginRes.status === 200 && trainerLoginRes.body?.data?.token) {
      trainerToken = trainerLoginRes.body.data.token as string;
    }
  }
}, 30000);

/******************************************************************************
  afterAll — delete created events and trainer user
******************************************************************************/

afterAll(async () => {
  // Delete all events created during the test run.
  // Cascading deletes on event_agents and event_groups are handled by the DB
  // foreign key constraints, so no manual cleanup of those join tables is needed.
  for (const eventId of createdEventIds) {
    try {
      await supabaseService.adminDelete('events', { id: eventId });
    } catch { /* best-effort */ }
  }

  // Delete agent user
  if (agentUserId) {
    try {
      await supabaseService.adminDeleteAuthUser(agentUserId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: agentUserId });
      } catch { /* best-effort */ }
    }
  }

  // Reset AG001
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // Delete trainer user
  if (trainerUserId) {
    try {
      await supabaseService.adminDeleteAuthUser(trainerUserId);
    } catch {
      try {
        await supabaseService.adminDelete('users', { id: trainerUserId });
      } catch { /* best-effort */ }
    }
  }

  // Reset AG005
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: TRAINER_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }
});

/******************************************************************************
  POST /api/events
******************************************************************************/

describe('POST /api/events — happy path', () => {
  it('returns 201 with event object when called by admin (groupIds only)', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Integration Test Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Created by integration test suite',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('tenant_id');
    expect(event).toHaveProperty('event_title', 'Integration Test Event');
    expect(event).toHaveProperty('description', 'Created by integration test suite');
    expect(event).toHaveProperty('start_date');
    expect(event).toHaveProperty('end_date');
    expect(event).toHaveProperty('status', 'upcoming');
    expect(event).toHaveProperty('type', 'Face to Face');
    expect(event).toHaveProperty('created_by');
    expect(event).toHaveProperty('created_by_role');
    expect(event).toHaveProperty('created_at');
    expect(event).toHaveProperty('updated_at');
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.groupIds).toContain(GROUP_ID_ALPHA);

    // Track for cleanup
    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });

  it('returns 201 with agentIds only (no groupIds) — status defaults to upcoming', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'AgentIds Only Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Event targeting agents directly',
        agentIds: [agentUserId!],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('status', 'upcoming');
    expect(event).toHaveProperty('type', 'Face to Face');
    expect(event).toHaveProperty('start_date');
    expect(event).toHaveProperty('end_date');
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.agentIds).toContain(agentUserId!);

    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });

  it('returns 201 with both groupIds and agentIds', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Groups And Agents Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Online',
        description: 'Event targeting both groups and agents',
        groupIds: [GROUP_ID_ALPHA],
        agentIds: [agentUserId!],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('type', 'Online');
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.groupIds).toContain(GROUP_ID_ALPHA);
    expect(event.agentIds).toContain(agentUserId!);

    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });
});

describe('POST /api/events — role guard', () => {
  it('returns 201 when called by agent role (agent is now allowed to create own events)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Role Guard Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Agent is now in ALLOWED_ROLES',
      });

    expect(res.status).toBe(201);

    if (res.body?.data?.id) {
      createdEventIds.push(res.body.data.id as string);
    }
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({
        title: 'No Auth Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should be rejected',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/events — validation', () => {
  it('returns 400 when date is in the past', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Past Event',
        startDate: pastDate(1),
        endDate: pastDate(1),
        type: 'Face to Face',
        description: 'Should fail validation',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when groupIds contains non-existent UUIDs', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Invalid Groups Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail group validation',
        groupIds: ['00000000-0000-0000-0000-000000000099'],
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when trainer submits groupIds they do not manage', async () => {
    // Trainer user has no entries in group_trainers — all groupIds are unmanaged
    expect(trainerToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${trainerToken}`)
      .send({
        title: 'Trainer Unmanaged Group Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail group ownership check',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when required fields are missing', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Missing Fields Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        // type and description omitted, no groupIds/agentIds
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when both groupIds and agentIds are omitted (non-agent role)', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'No Audience Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail — at least one of groupIds or agentIds required for admin',
      });

    // The Zod schema no longer enforces this — the controller returns 400 with its own message
    expect(res.status).toBe(400);
  });

  it('returns 400 when groupIds is an empty array', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'No Groups Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail validation',
        groupIds: [],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'At least one of groupIds or agentIds must be provided');
  });

  it('returns 400 for an invalid type value', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad Type Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Virtual',
        description: 'Should fail type validation',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when agentIds contains duplicate UUIDs', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Duplicate Agent IDs Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail — duplicate agentIds',
        agentIds: [agentUserId!, agentUserId!],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when agentIds contains a user with non-agent/non-group_leader role', async () => {
    expect(adminToken).not.toBeNull();
    expect(adminUserId).not.toBeNull();

    // Admin role is not agent or group_leader — service should reject with InvalidAgentIdsError
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Invalid Role Agent Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail — admin user is not agent/group_leader',
        agentIds: [adminUserId!],
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when agentIds contains a non-existent UUID', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Non-existent Agent Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail — non-existent agentId',
        agentIds: ['00000000-0000-0000-0000-000000000099'],
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 for unknown fields (strict mode)', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Extra Field Event',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        type: 'Face to Face',
        description: 'Should fail strict validation',
        groupIds: [GROUP_ID_ALPHA],
        unknownField: 'value',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  PUT /api/events/:eventId
******************************************************************************/

describe('PUT /api/events/:eventId — happy path', () => {
  it('returns 200 with updated event fields', async () => {
    expect(adminToken).not.toBeNull();

    // Create an event to update
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event To Update',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        type: 'Face to Face',
        description: 'Original description',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Updated Event Title',
        description: 'Updated description',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id', eventId);
    expect(event).toHaveProperty('event_title', 'Updated Event Title');
    expect(event).toHaveProperty('description', 'Updated description');
    expect(event).toHaveProperty('start_date');
    expect(event).toHaveProperty('end_date');
    expect(event).toHaveProperty('status');
    expect(event).toHaveProperty('type');
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(Array.isArray(event.agentIds)).toBe(true);
  });

  it('returns 200 and verifies groups are replaced when groupIds is updated', async () => {
    expect(adminToken).not.toBeNull();

    // Create an event targeting GROUP_ID_ALPHA
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event For Group Update',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        type: 'Face to Face',
        description: 'Will have groups replaced',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    // Update to use GROUP_ID_BETA instead
    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        groupIds: [GROUP_ID_BETA],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id', eventId);
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(event.groupIds).toContain(GROUP_ID_BETA);
    expect(Array.isArray(event.agentIds)).toBe(true);
  });

  it('returns 200 when updating with only agentIds', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    // Create an event with groupIds first
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event For AgentIds Update',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        type: 'Online',
        description: 'Will have agentIds added via PUT',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        agentIds: [agentUserId!],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id', eventId);
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.agentIds).toContain(agentUserId!);
  });

  it('returns 200 when updating status to completed', async () => {
    expect(adminToken).not.toBeNull();

    // Create an event to update
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event To Complete',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        type: 'Face to Face',
        description: 'Will be marked completed',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'completed',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id', eventId);
    expect(event).toHaveProperty('status', 'completed');
  });

  it('returns 200 when updating the type field', async () => {
    expect(adminToken).not.toBeNull();

    // Create a Face to Face event
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event To Change Type',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        type: 'Face to Face',
        description: 'Type will be changed to Online',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'Online',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id', eventId);
    expect(event).toHaveProperty('type', 'Online');
  });
});

describe('PUT /api/events/:eventId — not found', () => {
  it('returns 404 for a non-existent eventId', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put('/api/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Ghost Event' });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/events/:eventId — role guard', () => {
  it('returns 404 when agent tries to update a non-existent event (agent is now allowed)', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .put('/api/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: 'Agent Update Attempt' });

    // Agent is now in ALLOWED_ROLES — event does not exist so 404 is expected
    expect(res.status).toBe(404);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .put('/api/events/00000000-0000-0000-0000-000000000000')
      .send({ title: 'No Auth Update' });

    expect(res.status).toBe(401);
  });
});

describe('PUT /api/events/:eventId — validation', () => {
  it('returns 400 when date is in the past', async () => {
    expect(adminToken).not.toBeNull();

    // Create an event first
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event For Past Date Update',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        type: 'Face to Face',
        description: 'Will attempt a past-date update',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .put(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startDate: pastDate(1) });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when no fields are provided', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .put('/api/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  GET /api/events
******************************************************************************/

describe('GET /api/events — happy path', () => {
  it('returns 200 with { success: true, data: [...] }', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns events with the expected shape when results exist', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    if ((res.body.data as unknown[]).length > 0) {
      const event = res.body.data[0] as Record<string, unknown>;
      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('tenant_id');
      expect(event).toHaveProperty('event_title');
      expect(event).toHaveProperty('start_date');
      expect(event).toHaveProperty('end_date');
      expect(event).toHaveProperty('status');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('description');
      expect(event).toHaveProperty('created_by');
      expect(event).toHaveProperty('created_by_role');
      expect(event).toHaveProperty('created_at');
      expect(event).toHaveProperty('updated_at');
      expect(Array.isArray(event.groupIds)).toBe(true);
      expect(Array.isArray(event.agentIds)).toBe(true);
    }
  });

  it('returns 200 with an array (possibly empty) for agent role', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .get('/api/events')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/events — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  GET /api/events/:eventId
******************************************************************************/

describe('GET /api/events/:eventId — happy path', () => {
  it('returns 200 with { success: true, data: { event } }', async () => {
    expect(adminToken).not.toBeNull();

    // Create an event to fetch
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event For Get By ID',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Online',
        description: 'Fetched in GET by ID test',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id', eventId);
    expect(event).toHaveProperty('event_title', 'Event For Get By ID');
    expect(event).toHaveProperty('description', 'Fetched in GET by ID test');
    expect(event).toHaveProperty('tenant_id');
    expect(event).toHaveProperty('start_date');
    expect(event).toHaveProperty('end_date');
    expect(event).toHaveProperty('status');
    expect(event).toHaveProperty('type', 'Online');
    expect(event).toHaveProperty('created_by');
    expect(event).toHaveProperty('created_at');
    expect(event).toHaveProperty('updated_at');
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.groupIds).toContain(GROUP_ID_ALPHA);
  });

  it('returns groupIds for event created with groupIds', async () => {
    expect(adminToken).not.toBeNull();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event With GroupIds Only',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Online',
        description: 'Testing groupIds returned on GET by ID',
        groupIds: [GROUP_ID_ALPHA, GROUP_ID_BETA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const event = res.body.data as Record<string, unknown>;
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect(event.groupIds).toContain(GROUP_ID_ALPHA);
    expect(event.groupIds).toContain(GROUP_ID_BETA);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect((event.agentIds as string[]).length).toBe(0);
  });

  it('returns agentIds for event created with agentIds', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Event With AgentIds Only',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Face to Face',
        description: 'Testing agentIds returned on GET by ID',
        agentIds: [agentUserId!],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    createdEventIds.push(eventId);

    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const event = res.body.data as Record<string, unknown>;
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.agentIds).toContain(agentUserId!);
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect((event.groupIds as string[]).length).toBe(0);
  });

  it('returns empty groupIds and agentIds for event with neither', async () => {
    // This scenario is not possible via the API (validation requires at least one),
    // so we seed the event directly via the admin client and check the GET response.
    expect(adminToken).not.toBeNull();

    // Insert an event row directly — bypasses the junction tables
    const { data: insertedRows } = await supabaseService.adminInsert('events', {
      tenant_id: TENANT_ID,
      event_title: 'Bare Event No Audience',
      start_date: futureDate(6),
      end_date: futureDate(6),
      type: 'Online',
      description: 'No groups, no agents',
      status: 'upcoming',
      created_by: adminUserId,
      created_by_role: 'admin',
    });

    const rows = insertedRows as unknown as { id: string }[];
    if (!rows || rows.length === 0) {
      // If direct insert is unavailable, skip gracefully
      return;
    }
    const eventId = rows[0].id;
    createdEventIds.push(eventId);

    const res = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const event = res.body.data as Record<string, unknown>;
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect((event.groupIds as string[]).length).toBe(0);
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect((event.agentIds as string[]).length).toBe(0);
  });
});

describe('GET /api/events/:eventId — not found', () => {
  it('returns 404 for a non-existent event ID', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/events/:eventId — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get(
      '/api/events/00000000-0000-0000-0000-000000000000',
    );
    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  DELETE /api/events/:eventId
******************************************************************************/

describe('DELETE /api/events/:eventId', () => {
  /** IDs created within this describe block — may already be deleted by test */
  const deleteBlockEventIds: string[] = [];

  afterAll(async () => {
    for (const eventId of deleteBlockEventIds) {
      try {
        await supabaseService.adminDelete('events', { id: eventId });
      } catch { /* best-effort — may already be deleted */ }
    }
  });

  it('returns 204 and event is gone (404) after agent deletes their own event', async () => {
    expect(agentToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    // Create an event as the agent
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Event To Delete',
        startDate: futureDate(3),
        endDate: futureDateEnd(3),
        type: 'Online',
        description: 'This event will be deleted by the agent',
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    deleteBlockEventIds.push(eventId);

    // Delete the event as the same agent
    const deleteRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(deleteRes.status).toBe(204);

    // Follow-up GET as same agent should return 404
    const getRes = await request(app)
      .get(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(getRes.status).toBe(404);
  });

  it('returns 403 or 404 when agent tries to delete another user\'s event', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentToken).not.toBeNull();

    // Create an event as admin
    const createRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Event Agent Cannot Delete',
        startDate: futureDate(3),
        endDate: futureDateEnd(3),
        type: 'Face to Face',
        description: 'Created by admin, agent should not be able to delete',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(createRes.status).toBe(201);
    const eventId = createRes.body.data.id as string;
    deleteBlockEventIds.push(eventId);
    createdEventIds.push(eventId);

    // Agent attempts to delete an event they did not create
    const deleteRes = await request(app)
      .delete(`/api/events/${eventId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect([403, 404]).toContain(deleteRes.status);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .delete('/api/events/00000000-0000-0000-0000-000000000001');

    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent event UUID', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .delete('/api/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  Agent event create + GET /api/events/:eventId/public
******************************************************************************/

describe('POST /api/events — agent create', () => {
  it('returns 201 with agentIds:[self], groupIds:[], created_by_role:agent, visibility:public when no audience fields sent', async () => {
    expect(agentToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Personal Event',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Online',
        description: 'Created by agent with no audience override',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('id');
    expect(event).toHaveProperty('created_by_role', 'agent');
    expect(event).toHaveProperty('visibility', 'public');
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.agentIds).toContain(agentUserId!);
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect((event.groupIds as string[]).length).toBe(0);

    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });

  it('returns 201 with visibility:private when agent explicitly sets visibility:private', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Private Event',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Face to Face',
        description: 'Agent-set private visibility',
        visibility: 'private',
      });

    expect(res.status).toBe(201);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('visibility', 'private');

    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });

  it('returns 201 and server overrides groupIds/agentIds to [self]/[] when agent sends them', async () => {
    expect(agentToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();
    expect(adminUserId).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Override Audience Event',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Online',
        description: 'Server should override groupIds and agentIds',
        groupIds: [GROUP_ID_ALPHA],
        agentIds: [adminUserId!],
      });

    expect(res.status).toBe(201);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('visibility', 'public');
    expect(Array.isArray(event.agentIds)).toBe(true);
    expect(event.agentIds).toContain(agentUserId!);
    expect(event.agentIds).not.toContain(adminUserId!);
    expect(Array.isArray(event.groupIds)).toBe(true);
    expect((event.groupIds as string[]).length).toBe(0);

    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });

  it('returns 201 with visibility:private when admin creates event with no visibility', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Event No Visibility',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Face to Face',
        description: 'Admin default visibility should be private',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(201);

    const event = res.body.data as Record<string, unknown>;
    expect(event).toHaveProperty('visibility', 'private');

    if (event.id) {
      createdEventIds.push(event.id as string);
    }
  });
});

describe('GET /api/events/:eventId/public', () => {
  /** IDs created within this describe block — cleaned up in afterAll via createdEventIds */
  let publicEventId: string | null = null;
  let privateEventId: string | null = null;
  let cancelledPublicEventId: string | null = null;
  let completedPublicEventId: string | null = null;
  let adminPublicEventId: string | null = null;

  beforeAll(async () => {
    if (!adminToken || !adminUserId) return;

    // Create a public upcoming event
    const publicRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Public Upcoming Event',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Online',
        description: 'Visible publicly',
        groupIds: [GROUP_ID_ALPHA],
        visibility: 'public',
      });
    if (publicRes.status === 201 && publicRes.body?.data?.id) {
      publicEventId = publicRes.body.data.id as string;
      createdEventIds.push(publicEventId);
    }

    // Create a private event
    const privateRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Private Event',
        startDate: futureDate(5),
        endDate: futureDateEnd(5),
        type: 'Online',
        description: 'Should not be visible publicly',
        groupIds: [GROUP_ID_ALPHA],
        visibility: 'private',
      });
    if (privateRes.status === 201 && privateRes.body?.data?.id) {
      privateEventId = privateRes.body.data.id as string;
      createdEventIds.push(privateEventId);
    }

    // Create a public event then update it to cancelled via admin insert
    const cancelledInsert = await supabaseService.adminInsert('events', {
      tenant_id: TENANT_ID,
      event_title: 'Cancelled Public Event',
      start_date: futureDate(5),
      end_date: futureDateEnd(5),
      type: 'Online',
      description: 'Cancelled and public',
      status: 'cancelled',
      visibility: 'public',
      created_by: adminUserId,
      created_by_role: 'admin',
    });
    const cancelledRows = cancelledInsert.data as unknown as { id: string }[];
    if (cancelledRows && cancelledRows.length > 0) {
      cancelledPublicEventId = cancelledRows[0].id;
      createdEventIds.push(cancelledPublicEventId);
    }

    // Create a public completed event via admin insert
    const completedInsert = await supabaseService.adminInsert('events', {
      tenant_id: TENANT_ID,
      event_title: 'Completed Public Event',
      start_date: futureDate(5),
      end_date: futureDateEnd(5),
      type: 'Online',
      description: 'Completed and public',
      status: 'completed',
      visibility: 'public',
      created_by: adminUserId,
      created_by_role: 'admin',
    });
    const completedRows = completedInsert.data as unknown as { id: string }[];
    if (completedRows && completedRows.length > 0) {
      completedPublicEventId = completedRows[0].id;
      createdEventIds.push(completedPublicEventId);
    }

    // Admin-created public event (same as publicEventId but explicit separate record)
    const adminPubRes = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Admin Created Public Event',
        startDate: futureDate(6),
        endDate: futureDateEnd(6),
        type: 'Face to Face',
        description: 'Admin role creates a public event',
        groupIds: [GROUP_ID_ALPHA],
        visibility: 'public',
      });
    if (adminPubRes.status === 201 && adminPubRes.body?.data?.id) {
      adminPublicEventId = adminPubRes.body.data.id as string;
      createdEventIds.push(adminPublicEventId);
    }
  }, 30000);

  it('returns 200 with IPublicEvent shape for a public upcoming event', async () => {
    expect(publicEventId).not.toBeNull();

    const res = await request(app)
      .get(`/api/events/${publicEventId}/public`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const data = res.body.data as Record<string, unknown>;
    // Required fields
    expect(data).toHaveProperty('id', publicEventId);
    expect(data).toHaveProperty('event_title');
    expect(data).toHaveProperty('start_date');
    expect(data).toHaveProperty('end_date');
    expect(data).toHaveProperty('type');
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('created_by_name');
    // Optional nullable fields present
    expect(Object.keys(data)).toContain('description');
    expect(Object.keys(data)).toContain('venue');
    expect(Object.keys(data)).toContain('meeting_link');

    // Sensitive fields MUST NOT be present
    expect(data).not.toHaveProperty('tenant_id');
    expect(data).not.toHaveProperty('created_by');
    expect(data).not.toHaveProperty('created_by_role');
    expect(data).not.toHaveProperty('visibility');
    expect(data).not.toHaveProperty('agentIds');
    expect(data).not.toHaveProperty('groupIds');
  });

  it('returns 404 with { success: false, message: "Event not found" } for a private event', async () => {
    expect(privateEventId).not.toBeNull();

    const res = await request(app)
      .get(`/api/events/${privateEventId}/public`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message', 'Event not found');
  });

  it('returns 404 for a public but cancelled event', async () => {
    if (!cancelledPublicEventId) return;

    const res = await request(app)
      .get(`/api/events/${cancelledPublicEventId}/public`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message', 'Event not found');
  });

  it('returns 200 for a public completed event (completed events are viewable)', async () => {
    if (!completedPublicEventId) return;

    const res = await request(app)
      .get(`/api/events/${completedPublicEventId}/public`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const data = res.body.data as Record<string, unknown>;
    expect(data).toHaveProperty('status', 'completed');
  });

  it('returns 200 with no Authorization header (unauthenticated access)', async () => {
    expect(publicEventId).not.toBeNull();

    const res = await request(app)
      .get(`/api/events/${publicEventId}/public`);
    // Deliberately no .set('Authorization', ...) header

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
  });

  it('returns 404 for a non-existent UUID', async () => {
    const res = await request(app)
      .get('/api/events/00000000-0000-0000-0000-000000000000/public');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message', 'Event not found');
  });

  it('returns 404 for a garbage non-UUID string', async () => {
    const res = await request(app)
      .get('/api/events/not-a-valid-uuid/public');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('message', 'Event not found');
  });

  it('returns 200 for an admin-created public event (model is role-agnostic)', async () => {
    expect(adminPublicEventId).not.toBeNull();

    const res = await request(app)
      .get(`/api/events/${adminPublicEventId}/public`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    const data = res.body.data as Record<string, unknown>;
    expect(data).toHaveProperty('id', adminPublicEventId);
    expect(data).not.toHaveProperty('tenant_id');
    expect(data).not.toHaveProperty('visibility');
  });
});
