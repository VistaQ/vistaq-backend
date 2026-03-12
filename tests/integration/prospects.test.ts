import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — GET /api/prospects, GET /api/prospects/:id, PUT /api/prospects/:id
******************************************************************************/

const TENANT_SLUG = 'demo-agency';

const AGENT_EMAIL = 'Deshaun.Bartell@hotmail.com';
const AGENT_PASSWORD = 'Password1!';

const ADMIN_EMAIL = 'jeremy.nathan1@gmail.com';
const ADMIN_PASSWORD = 'password';

const GROUP_LEADER_EMAIL = 'Abner_Cormier@gmail.com';
const GROUP_LEADER_PASSWORD = 'Password1!';

let agentToken: string | null = null;
let adminToken: string | null = null;
let groupLeaderToken: string | null = null;

/** ID of the test prospect created in beforeAll, deleted in afterAll */
let testProspectId: string | null = null;

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

  // Create a test prospect via the API using the agent token
  const createRes = await request(app)
    .post('/api/prospects')
    .set('Authorization', `Bearer ${agentToken}`)
    .send({ fullName: 'Integration Test Prospect' });

  if (createRes.status === 201 && createRes.body?.data?.id) {
    testProspectId = createRes.body.data.id as string;
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
