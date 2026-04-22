import path from 'path';
import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — GET /api/prospects, GET /api/prospects/:id, PUT /api/prospects/:id,
               DELETE /api/prospects/:id
******************************************************************************/

// Credentials are sourced from the seed manifest written by scripts/bootstrap.js.
// Run `npx supabase db reset && node scripts/bootstrap.js` to regenerate.
const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantSlug: string;
  adminPassword: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string; groupId?: string }>;
};

const TENANT_SLUG = manifest.tenantSlug;

const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;
const AGENT_PASSWORD = manifest.password;

const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = manifest.adminPassword;

const GROUP_LEADER_EMAIL = manifest.users.mdrt_stars_leader.email;
const GROUP_LEADER_PASSWORD = manifest.password;

const TRAINER_EMAIL = manifest.users.mdrt_stars_trainer.email;
const TRAINER_PASSWORD = manifest.password;

const OTHER_AGENT_EMAIL = manifest.users.kpi_busters_agent.email;
const OTHER_AGENT_PASSWORD = manifest.password;

let agentToken: string | null = null;
let adminToken: string | null = null;
let groupLeaderToken: string | null = null;
let trainerToken: string | null = null;
let otherAgentToken: string | null = null;

/** ID of the test prospect created in beforeAll, deleted in afterAll */
let testProspectId: string | null = null;

/** ID of a separately-created prospect used exclusively for DELETE tests */
let deleteTestProspectId: string | null = null;

/******************************************************************************
  beforeAll — obtain tokens and create a test prospect
******************************************************************************/

beforeAll(async () => {
  // Log in as agent
  const agentRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: AGENT_EMAIL, password: AGENT_PASSWORD });

  if (agentRes.status === 200 && agentRes.body?.data?.token) {
    agentToken = agentRes.body.data.token as string;
  }

  // Log in as admin
  const adminRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (adminRes.status === 200 && adminRes.body?.data?.token) {
    adminToken = adminRes.body.data.token as string;
  }

  // Log in as group leader
  const leaderRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GROUP_LEADER_EMAIL, password: GROUP_LEADER_PASSWORD });

  if (leaderRes.status === 200 && leaderRes.body?.data?.token) {
    groupLeaderToken = leaderRes.body.data.token as string;
  }

  // Log in as trainer
  const trainerRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: TRAINER_EMAIL, password: TRAINER_PASSWORD });

  if (trainerRes.status === 200 && trainerRes.body?.data?.token) {
    trainerToken = trainerRes.body.data.token as string;
  }

  // Log in as other-tenant agent (kpi_busters_agent — different group, same tenant)
  const otherAgentRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: OTHER_AGENT_EMAIL, password: OTHER_AGENT_PASSWORD });

  if (otherAgentRes.status === 200 && otherAgentRes.body?.data?.token) {
    otherAgentToken = otherAgentRes.body.data.token as string;
  }

  // Create a test prospect via the API using the agent token
  const createRes = await request(app)
    .post('/api/prospects')
    .set('Authorization', `Bearer ${agentToken}`)
    .send({ fullName: 'Integration Test Prospect' });

  if (createRes.status === 201 && createRes.body?.data?.id) {
    testProspectId = createRes.body.data.id as string;
  }

  // Create a dedicated prospect for DELETE tests (owned by agent)
  const deleteCreateRes = await request(app)
    .post('/api/prospects')
    .set('Authorization', `Bearer ${agentToken}`)
    .send({ fullName: 'Delete Test Prospect' });

  if (deleteCreateRes.status === 201 && deleteCreateRes.body?.data?.id) {
    deleteTestProspectId = deleteCreateRes.body.data.id as string;
  }
}, 30000);

/******************************************************************************
  afterAll — delete the test prospect via admin client
******************************************************************************/

afterAll(async () => {
  if (testProspectId) {
    try {
      await supabaseService.adminDelete('prospects', { id: testProspectId });
    } catch {
      // best-effort
    }
  }
  // Clean up the delete-test prospect in case any guard tests left it in place
  if (deleteTestProspectId) {
    try {
      await supabaseService.adminDelete('prospects', { id: deleteTestProspectId });
    } catch {
      // best-effort — may already have been deleted by the happy-path test
    }
  }
});

/******************************************************************************
  GET /api/prospects
******************************************************************************/

describe('GET /api/prospects — happy path', () => {
  it('returns 200 with { success: true, data: [...] } for an agent', async () => {
    const res = await request(app)
      .get('/api/prospects')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns an empty array when there are no results (not null)', async () => {
    const res = await request(app)
      .get('/api/prospects')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns prospects with the expected shape', async () => {
    const res = await request(app)
      .get('/api/prospects')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    if (res.body.data.length > 0) {
      const prospect = res.body.data[0] as Record<string, unknown>;
      expect(prospect).toHaveProperty('id');
      expect(prospect).toHaveProperty('tenant_id');
      expect(prospect).toHaveProperty('agent_id');
      expect(prospect).toHaveProperty('prospect_name');
      expect(prospect).toHaveProperty('current_stage');
      expect(prospect).toHaveProperty('created_at');
      expect(prospect).toHaveProperty('updated_at');
    }
  });
});

describe('GET /api/prospects — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/prospects');
    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  GET /api/prospects/:prospectId
******************************************************************************/

describe('GET /api/prospects/:prospectId — happy path', () => {
  it('returns 200 with { success: true, data: { prospect } }', async () => {
    expect(testProspectId).not.toBeNull();

    const res = await request(app)
      .get(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const prospect = res.body.data as Record<string, unknown>;
    expect(prospect).toHaveProperty('id', testProspectId);
    expect(prospect).toHaveProperty('prospect_name', 'Integration Test Prospect');
    expect(prospect).toHaveProperty('current_stage', 'prospect');
    expect(prospect).toHaveProperty('stage_history');
    expect(Array.isArray(prospect.stage_history)).toBe(true);
  });
});

describe('GET /api/prospects/:prospectId — not found', () => {
  it('returns 404 for a non-existent prospect ID', async () => {
    const res = await request(app)
      .get('/api/prospects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/prospects/:prospectId — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get(`/api/prospects/${testProspectId}`);
    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  PUT /api/prospects/:prospectId
******************************************************************************/

describe('PUT /api/prospects/:prospectId — happy path (agent)', () => {
  it('returns 200 with updated prospect when agent updates their own prospect', async () => {
    expect(testProspectId).not.toBeNull();

    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ appointmentStatus: 'scheduled', appointmentLocation: 'KL Office' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');

    const prospect = res.body.data as Record<string, unknown>;
    expect(prospect).toHaveProperty('id', testProspectId);
    expect(prospect).toHaveProperty('appointment_status', 'scheduled');
    expect(prospect).toHaveProperty('appointment_location', 'KL Office');
  });

  it('appends to stage_history when currentStage changes', async () => {
    expect(testProspectId).not.toBeNull();

    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ currentStage: 'appointment' });

    expect(res.status).toBe(200);

    const prospect = res.body.data as Record<string, unknown>;
    expect(prospect).toHaveProperty('current_stage', 'appointment');
    expect(Array.isArray(prospect.stage_history)).toBe(true);

    const history = prospect.stage_history as { stage: string; enteredAt: string }[];
    const lastEntry = history[history.length - 1];
    expect(lastEntry).toHaveProperty('stage', 'appointment');
    expect(lastEntry).toHaveProperty('enteredAt');
  });

  it('does not append to stage_history when currentStage is unchanged', async () => {
    expect(testProspectId).not.toBeNull();

    // Get current state first
    const beforeRes = await request(app)
      .get(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`);
    const historyBefore = (beforeRes.body.data as Record<string, unknown>).stage_history as unknown[];

    // Update with the same stage
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ currentStage: 'appointment' });

    expect(res.status).toBe(200);
    const historyAfter = (res.body.data as Record<string, unknown>).stage_history as unknown[];
    expect(historyAfter.length).toBe(historyBefore.length);
  });

  it('updates sales fields correctly', async () => {
    expect(testProspectId).not.toBeNull();

    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({
        salesMeetingStages: ['social', 'factFind'],
        products: [{ productName: 'Life Insurance', amount: 5000 }],
        salesOutcome: 'kiv',
      });

    expect(res.status).toBe(200);
    const prospect = res.body.data as Record<string, unknown>;
    expect(prospect).toHaveProperty('sales_outcome', 'kiv');
    expect(Array.isArray(prospect.sales_parts_completed)).toBe(true);
    expect(Array.isArray(prospect.products_sold)).toBe(true);
  });
});

describe('PUT /api/prospects/:prospectId — role guard', () => {
  it('returns 403 when admin tries to update a prospect', async () => {
    expect(testProspectId).not.toBeNull();

    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ appointmentLocation: 'Test' });

    expect(res.status).toBe(403);
  });

  it('returns 404 when group_leader tries to update a prospect they do not own (RLS silently blocks update)', async () => {
    // group_leader passes the controller role check AND can read the prospect via the
    // read policy (agents in their group). However, the update RLS restricts writes to
    // rows where agent_id = caller's user_id, so the UPDATE returns 0 rows →
    // ProspectNotFoundError → 404.
    expect(testProspectId).not.toBeNull();

    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${groupLeaderToken}`)
      .send({ appointmentLocation: 'Test' });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/prospects/:prospectId — not found', () => {
  it('returns 404 for a non-existent prospect ID', async () => {
    const res = await request(app)
      .put('/api/prospects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ appointmentLocation: 'Test' });

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/prospects/:prospectId — validation', () => {
  it('returns 400 when no fields are provided', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 for invalid currentStage enum', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ currentStage: 'invalid_stage' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 for invalid appointmentStatus enum', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ appointmentStatus: 'completed' }); // old value, no longer valid

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when salesOutcome is unsuccessful but unsuccessfulReason is missing', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ salesOutcome: 'unsuccessful' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 200 when salesOutcome is unsuccessful and unsuccessfulReason is provided', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ salesOutcome: 'unsuccessful', unsuccessfulReason: 'Client not interested' });

    expect(res.status).toBe(200);
    const prospect = res.body.data as Record<string, unknown>;
    expect(prospect).toHaveProperty('sales_outcome', 'unsuccessful');
    expect(prospect).toHaveProperty('unsuccessful_reason', 'Client not interested');
  });

  it('returns 400 for unknown fields (strict mode)', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ unknownField: 'value' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('PUT /api/prospects/:prospectId — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app)
      .put(`/api/prospects/${testProspectId}`)
      .send({ appointmentLocation: 'Test' });

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  DELETE /api/prospects/:prospectId
******************************************************************************/

describe('DELETE /api/prospects/:prospectId — role guard', () => {
  it('returns 403 when a trainer tries to delete a prospect', async () => {
    expect(deleteTestProspectId).not.toBeNull();

    const res = await request(app)
      .delete(`/api/prospects/${deleteTestProspectId}`)
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(403);
  });

  it('returns 404 when a group_leader tries to delete a prospect they do not own', async () => {
    expect(deleteTestProspectId).not.toBeNull();

    // groupLeaderToken belongs to mdrt_stars_leader — they can read prospects in their group
    // but the ownership check (agent_id !== userId) fires first → 404
    const res = await request(app)
      .delete(`/api/prospects/${deleteTestProspectId}`)
      .set('Authorization', `Bearer ${groupLeaderToken}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/prospects/:prospectId — auth guard', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    expect(deleteTestProspectId).not.toBeNull();

    const res = await request(app)
      .delete(`/api/prospects/${deleteTestProspectId}`);

    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/prospects/:prospectId — not found', () => {
  it('returns 404 for a non-existent prospect ID', async () => {
    const res = await request(app)
      .delete('/api/prospects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(404);
  });

  it('returns 404 when another agent tries to delete a prospect they do not own (RLS hides it)', async () => {
    expect(deleteTestProspectId).not.toBeNull();

    // otherAgentToken belongs to kpi_busters_agent — a different agent in a different group.
    // RLS on prospects restricts visibility to the owning agent, so findById returns null → 404.
    const res = await request(app)
      .delete(`/api/prospects/${deleteTestProspectId}`)
      .set('Authorization', `Bearer ${otherAgentToken}`);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/prospects/:prospectId — happy path', () => {
  it('returns 200 with { success: true } when agent deletes their own prospect', async () => {
    expect(deleteTestProspectId).not.toBeNull();

    const res = await request(app)
      .delete(`/api/prospects/${deleteTestProspectId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);

    // Mark as deleted so afterAll skip is clean
    deleteTestProspectId = null;
  });
});

describe('DELETE /api/prospects/:prospectId — already deleted', () => {
  it('returns 404 when the same prospect is deleted a second time', async () => {
    // Create a fresh prospect, delete it once, then attempt a second delete
    const createRes = await request(app)
      .post('/api/prospects')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ fullName: 'Ephemeral Prospect For Double Delete' });

    expect(createRes.status).toBe(201);
    const ephemeralId = createRes.body.data.id as string;

    // First delete — should succeed
    const firstDelete = await request(app)
      .delete(`/api/prospects/${ephemeralId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(firstDelete.status).toBe(200);

    // Second delete — prospect no longer exists
    const secondDelete = await request(app)
      .delete(`/api/prospects/${ephemeralId}`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(secondDelete.status).toBe(404);
  });
});
