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
const ADMIN_EMAIL = 'jeremy.nathan1@gmail.com';
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

/** A future date string in YYYY-MM-DD format, always at least one day ahead */
function futureDate(offsetDays = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

/** A past date string in YYYY-MM-DD format */
function pastDate(offsetDays = 1): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().split('T')[0];
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '10:00',
        endTime: '12:00',
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
        date: futureDate(7),
        startTime: '14:00',
        endTime: '16:00',
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
  it('returns 403 when called by agent role', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        title: 'Agent Event Attempt',
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
        type: 'Face to Face',
        description: 'Should be rejected',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(403);
  });

  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .post('/api/events')
      .send({
        title: 'No Auth Event',
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: pastDate(1),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
        // type and description omitted, no groupIds/agentIds
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when both groupIds and agentIds are omitted', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'No Audience Event',
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
        type: 'Face to Face',
        description: 'Should fail — at least one of groupIds or agentIds required',
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when groupIds is an empty array', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'No Groups Event',
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
        type: 'Face to Face',
        description: 'Should fail validation',
        groupIds: [],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 for an invalid type value', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Bad Type Event',
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(7),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(10),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(10),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(10),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(10),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(10),
        startTime: '09:00',
        endTime: '11:00',
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
  it('returns 403 when called by agent role', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .put('/api/events/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ title: 'Agent Update Attempt' });

    expect(res.status).toBe(403);
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
        date: futureDate(10),
        startTime: '09:00',
        endTime: '11:00',
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
      .send({ date: pastDate(1) });

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
        date: futureDate(5),
        startTime: '09:00',
        endTime: '11:00',
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
        date: futureDate(5),
        startTime: '10:00',
        endTime: '12:00',
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
        date: futureDate(5),
        startTime: '13:00',
        endTime: '15:00',
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
