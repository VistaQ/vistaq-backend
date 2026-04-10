import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — Coaching Sessions API
  POST   /api/coaching-sessions
  GET    /api/coaching-sessions
  GET    /api/coaching-sessions/:sessionId
  PUT    /api/coaching-sessions/:sessionId
  DELETE /api/coaching-sessions/:sessionId
  POST   /api/coaching-sessions/:sessionId/join
  POST   /api/coaching-sessions/:sessionId/mark-non-attendees
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const TENANT_ID = '00000000-0000-0000-0000-000000000001';

/** Seeded group UUIDs (see supabase/seed.sql) */
const GROUP_ID_ALPHA = '00000000-0000-4000-8000-000000000001'; // Alpha Team

/** Admin account — must exist in the running local Supabase instance */
const ADMIN_EMAIL = 'admin@demo-agency.com';
const ADMIN_PASSWORD = 'password';

/**
 * Agent account — created in beforeAll via POST /api/auth/register.
 * Uses agent code AG003 (seeded, unused).
 */
const AGENT_EMAIL = `test.coaching.agent.${Date.now()}@example.com`;
const AGENT_PASSWORD = 'Password1!';
const AGENT_AGENT_CODE = 'AG003';

let adminToken: string | null = null;
let agentToken: string | null = null;
let agentUserId: string | null = null;

/** IDs of coaching sessions created during the test run — deleted in afterAll */
const createdSessionIds: string[] = [];

/** A future ISO 8601 datetime string with UTC timezone, always at least N days ahead */
function futureDate(offsetDays = 7): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString();
}

/** A future ISO 8601 end datetime string, offset by extra hours from start */
function futureDateEnd(offsetDays = 7, extraHours = 2): string {
  return new Date(Date.now() + offsetDays * 86400000 + extraHours * 3600000).toISOString();
}

/** A past ISO 8601 datetime string with UTC timezone */
function pastDate(offsetDays = 1): string {
  return new Date(Date.now() - offsetDays * 86400000).toISOString();
}

/******************************************************************************
  beforeAll — obtain tokens and provision an agent user
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

  // ── 2. Clean up any stale agent from a previous run ────────────────────────
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

  // Reset AG003
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }

  // ── 3. Register an agent user ─────────────────────────────────────────────
  const agentRegisterRes = await request(app)
    .post('/api/auth/register')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({
      fullName: 'Test Coaching Agent',
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
}, 30000);

/******************************************************************************
  afterAll — delete created sessions and agent user
******************************************************************************/

afterAll(async () => {
  // Delete all coaching sessions created during the test run (CASCADE handles junction + attendance)
  for (const id of createdSessionIds) {
    try {
      await supabaseService.adminDelete('coaching_sessions', { id } as any);
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

  // Reset AG003
  try {
    await supabaseService.adminUpdate(
      'agent_codes',
      { is_used: false, user_id: null },
      { agent_code: AGENT_AGENT_CODE, tenant_id: TENANT_ID },
    );
  } catch { /* best-effort */ }
});

/******************************************************************************
  POST /api/coaching-sessions — Create session
******************************************************************************/

describe('POST /api/coaching-sessions — happy path', () => {
  it('returns 201 with session object when called by admin', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'individual_coaching',
        title: 'Integration Test Session',
        description: 'Created by integration test suite',
        startDate: futureDate(7),
        endDate: futureDateEnd(7),
        trainingMode: 'online',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const session = res.body.data as Record<string, unknown>;
    expect(session).toHaveProperty('id');
    expect(session).toHaveProperty('tenant_id');
    expect(session).toHaveProperty('coaching_type', 'individual_coaching');
    expect(session).toHaveProperty('title', 'Integration Test Session');
    expect(session).toHaveProperty('description', 'Created by integration test suite');
    expect(session).toHaveProperty('training_mode', 'online');
    expect(session).toHaveProperty('status', 'upcoming');
    expect(session).toHaveProperty('created_by');
    expect(session).toHaveProperty('created_by_name');
    expect(session).toHaveProperty('created_by_role');
    expect(session.created_by_name).toBeTruthy();
    expect(session.created_by_role).toBeTruthy();
    expect(session).toHaveProperty('created_at');
    expect(session).toHaveProperty('updated_at');
    // Schema uses start_date / end_date (TIMESTAMPTZ) — old date/start_time/end_time columns removed
    expect(session).toHaveProperty('start_date');
    expect(session).toHaveProperty('end_date');
    expect(typeof session.start_date).toBe('string');
    expect(typeof session.end_date).toBe('string');
    expect(session).not.toHaveProperty('date');
    expect(session).not.toHaveProperty('start_time');
    expect(session).not.toHaveProperty('end_time');
    expect(Array.isArray(session.targetGroupIds)).toBe(true);
    expect(Array.isArray(session.targetAgentIds)).toBe(true);
    expect(Array.isArray(session.attendance)).toBe(true);

    if (session.id) {
      createdSessionIds.push(session.id as string);
    }
  });

  it('returns 201 with groupIds — attendance populated for group agents', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'group_coaching',
        title: 'Group Session',
        startDate: futureDate(10),
        endDate: futureDateEnd(10),
        trainingMode: 'face_to_face',
        groupIds: [GROUP_ID_ALPHA],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const session = res.body.data as Record<string, unknown>;
    expect(session).toHaveProperty('id');
    expect(Array.isArray(session.targetGroupIds)).toBe(true);
    expect(session.targetGroupIds).toContain(GROUP_ID_ALPHA);
    expect(Array.isArray(session.attendance)).toBe(true);

    if (session.id) {
      createdSessionIds.push(session.id as string);
    }
  });

  it('returns 201 with agentIds — attendance populated for targeted agent', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'individual_coaching',
        title: 'Agent-Targeted Session',
        startDate: futureDate(14),
        endDate: futureDateEnd(14),
        trainingMode: 'online',
        agentIds: [agentUserId!],
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);

    const session = res.body.data as Record<string, unknown>;
    expect(session).toHaveProperty('id');
    expect(Array.isArray(session.targetAgentIds)).toBe(true);
    expect(session.targetAgentIds).toContain(agentUserId!);
    expect(Array.isArray(session.attendance)).toBe(true);

    // Should have a pending attendance record for the agent
    const attendance = session.attendance as Array<Record<string, unknown>>;
    const agentRecord = attendance.find((a) => a.agent_id === agentUserId);
    expect(agentRecord).toBeDefined();
    expect(agentRecord?.status).toBe('pending');

    if (session.id) {
      createdSessionIds.push(session.id as string);
    }
  });
});

/******************************************************************************
  POST /api/coaching-sessions — Validation errors
******************************************************************************/

describe('POST /api/coaching-sessions — validation errors', () => {
  it('returns 400 when required fields are missing', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid coachingType', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'invalid_type',
        title: 'Bad Type Session',
        startDate: futureDate(),
        endDate: futureDateEnd(),
        trainingMode: 'online',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 for past date', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'individual_coaching',
        title: 'Past Date Session',
        startDate: pastDate(5),
        endDate: pastDate(5),
        trainingMode: 'online',
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid time format', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'individual_coaching',
        title: 'Bad Time Session',
        startDate: 'not-a-valid-iso-datetime',
        endDate: futureDateEnd(),
        trainingMode: 'online',
      });

    expect(res.status).toBe(400);
  });
});

/******************************************************************************
  POST /api/coaching-sessions — Role guard
******************************************************************************/

describe('POST /api/coaching-sessions — role guard', () => {
  it('returns 403 when called by agent role', async () => {
    expect(agentToken).not.toBeNull();

    const res = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        coachingType: 'individual_coaching',
        title: 'Agent Attempt',
        startDate: futureDate(),
        endDate: futureDateEnd(),
        trainingMode: 'online',
      });

    expect(res.status).toBe(403);
  });
});

/******************************************************************************
  GET /api/coaching-sessions — List sessions
******************************************************************************/

describe('GET /api/coaching-sessions', () => {
  it('returns 200 with an array of sessions', async () => {
    expect(adminToken).not.toBeNull();

    const res = await request(app)
      .get('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);

    // Each session should have an attendance array
    for (const session of res.body.data as Record<string, unknown>[]) {
      expect(Array.isArray(session.attendance)).toBe(true);
    }
  });
});

/******************************************************************************
  GET /api/coaching-sessions/:sessionId — Get by ID
******************************************************************************/

describe('GET /api/coaching-sessions/:sessionId', () => {
  it('returns 200 with the session when given a valid ID', async () => {
    expect(adminToken).not.toBeNull();
    expect(createdSessionIds.length).toBeGreaterThan(0);

    const sessionId = createdSessionIds[0];
    const res = await request(app)
      .get(`/api/coaching-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('id', sessionId);
    expect(Array.isArray(res.body.data.attendance)).toBe(true);
  });

  it('returns 404 for a non-existent session ID', async () => {
    expect(adminToken).not.toBeNull();

    const fakeId = '00000000-0000-0000-0000-ffffffffffff';
    const res = await request(app)
      .get(`/api/coaching-sessions/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  PUT /api/coaching-sessions/:sessionId — Update session
******************************************************************************/

describe('PUT /api/coaching-sessions/:sessionId', () => {
  it('returns 200 and updates the title', async () => {
    expect(adminToken).not.toBeNull();
    expect(createdSessionIds.length).toBeGreaterThan(0);

    const sessionId = createdSessionIds[0];
    const newTitle = 'Updated Integration Test Session';

    const res = await request(app)
      .put(`/api/coaching-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: newTitle });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('title', newTitle);
    expect(res.body.data).toHaveProperty('id', sessionId);
  });
});

/******************************************************************************
  POST /api/coaching-sessions/:sessionId/join — Join session
******************************************************************************/

describe('POST /api/coaching-sessions/:sessionId/join', () => {
  it('returns 200 with attendance record status "joined"', async () => {
    expect(adminToken).not.toBeNull();
    expect(createdSessionIds.length).toBeGreaterThan(0);

    const sessionId = createdSessionIds[0];

    const res = await request(app)
      .post(`/api/coaching-sessions/${sessionId}/join`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('status', 'joined');
    expect(res.body.data).toHaveProperty('joined_at');
    expect(res.body.data.joined_at).toBeTruthy();
  });

  it('is idempotent — calling join again returns 200 with "joined"', async () => {
    expect(adminToken).not.toBeNull();
    expect(createdSessionIds.length).toBeGreaterThan(0);

    const sessionId = createdSessionIds[0];

    const res = await request(app)
      .post(`/api/coaching-sessions/${sessionId}/join`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('status', 'joined');
  });
});

/******************************************************************************
  POST /api/coaching-sessions/:sessionId/mark-non-attendees
******************************************************************************/

describe('POST /api/coaching-sessions/:sessionId/mark-non-attendees', () => {
  let markSessionId: string | null = null;

  it('marks pending attendance records as did_not_attend', async () => {
    expect(adminToken).not.toBeNull();
    expect(agentUserId).not.toBeNull();

    // Create a session with an agent to generate a pending attendance record
    const createRes = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'individual_coaching',
        title: 'Mark Non-Attendees Test',
        startDate: futureDate(3),
        endDate: futureDateEnd(3),
        trainingMode: 'online',
        agentIds: [agentUserId!],
      });

    expect(createRes.status).toBe(201);
    markSessionId = createRes.body.data.id as string;
    createdSessionIds.push(markSessionId);

    // Verify there is a pending attendance record
    const getBeforeRes = await request(app)
      .get(`/api/coaching-sessions/${markSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getBeforeRes.status).toBe(200);
    const attendanceBefore = getBeforeRes.body.data.attendance as Array<Record<string, unknown>>;
    const pendingRecords = attendanceBefore.filter((a) => a.status === 'pending');
    expect(pendingRecords.length).toBeGreaterThan(0);

    // Call mark-non-attendees
    const markRes = await request(app)
      .post(`/api/coaching-sessions/${markSessionId}/mark-non-attendees`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(markRes.status).toBe(200);
    expect(markRes.body).toHaveProperty('success', true);

    // Verify pending records are now did_not_attend
    const getAfterRes = await request(app)
      .get(`/api/coaching-sessions/${markSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getAfterRes.status).toBe(200);
    const attendanceAfter = getAfterRes.body.data.attendance as Array<Record<string, unknown>>;
    const stillPending = attendanceAfter.filter((a) => a.status === 'pending');
    expect(stillPending.length).toBe(0);

    // The records that were pending should now be did_not_attend
    const didNotAttend = attendanceAfter.filter((a) => a.status === 'did_not_attend');
    expect(didNotAttend.length).toBe(pendingRecords.length);
  });
});

/******************************************************************************
  DELETE /api/coaching-sessions/:sessionId — Delete session
******************************************************************************/

describe('DELETE /api/coaching-sessions/:sessionId', () => {
  it('returns 200 and session is no longer accessible', async () => {
    expect(adminToken).not.toBeNull();

    // Create a throwaway session
    const createRes = await request(app)
      .post('/api/coaching-sessions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        coachingType: 'peer_circles',
        title: 'Delete Me Session',
        startDate: futureDate(20),
        endDate: futureDateEnd(20),
        trainingMode: 'online',
      });

    expect(createRes.status).toBe(201);
    const deleteSessionId = createRes.body.data.id as string;

    // Delete it
    const deleteRes = await request(app)
      .delete(`/api/coaching-sessions/${deleteSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty('success', true);

    // Verify it is gone
    const getRes = await request(app)
      .get(`/api/coaching-sessions/${deleteSessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(404);
  });
});

/******************************************************************************
  Auth — Unauthenticated request
******************************************************************************/

describe('Coaching Sessions — unauthenticated', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await request(app)
      .get('/api/coaching-sessions');

    expect(res.status).toBe(401);
  });
});
