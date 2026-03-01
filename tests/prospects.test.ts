/**
 * Prospects API — Integration Tests
 *
 * Covers all cases from the test plan:
 *   POST   /api/prospects
 *   GET    /api/prospects/my-prospects
 *   GET    /api/prospects/:id
 *   GET    /api/prospects/group/:groupId
 *   PUT    /api/prospects/:id
 *   DELETE /api/prospects/:id
 *   GET    /api/admin/all-prospects
 */
import request from 'supertest';
import app from '@src/server';
import { getFixtures, type Fixtures } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function auth(token: string) {
  return request.agent(app).set('Authorization', `Bearer ${token}`);
}

/** Minimal valid prospect body — override individual fields per test */
function validProspect(overrides: Record<string, unknown> = {}) {
  return {
    prospectName: 'Test Prospect',
    prospectEmail: 'prospect@example.com',
    prospectPhone: '0123456789',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Prospects API', () => {
  let f: Fixtures;

  // Created prospect IDs — cleaned up in afterAll
  const createdProspectIds: string[] = [];

  beforeAll(async () => {
    f = await getFixtures();
  });

  afterAll(async () => {
    const { default: adminPkg } = await import('firebase-admin');
    const db = adminPkg.firestore();
    await Promise.all(
      createdProspectIds.map((id) =>
        db.collection('prospects').doc(id).delete(),
      ),
    );
  });

  // ── Helper to create a prospect and track its ID for cleanup ────────────
  async function createProspect(
    token: string,
    body: object,
  ): Promise<request.Response> {
    const res = await auth(token).post('/api/prospects').send(body);
    if (res.status === 201 && res.body.prospectId) {
      createdProspectIds.push(res.body.prospectId as string);
    }
    return res;
  }

  // ==========================================================================
  // POST /api/prospects
  // ==========================================================================

  describe('POST /api/prospects', () => {
    it('TC-P01 — agent creates valid prospect', async () => {
      const res = await createProspect(
        f.users.agent_star_1.token,
        validProspect(),
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        prospectId: expect.any(String),
        message: 'Prospect created successfully',
      });
    });

    it('TC-P02 — group leader creates valid prospect', async () => {
      const res = await createProspect(
        f.users.leader_star.token,
        validProspect({ prospectName: 'Leader Prospect' }),
      );
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('TC-P03 — trainer is blocked from creating prospects', async () => {
      const res = await createProspect(
        f.users.trainer_star.token,
        validProspect(),
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only agents and group leaders/i);
    });

    it('TC-P04 — admin is blocked from creating prospects', async () => {
      const res = await createProspect(f.users.admin.token, validProspect());
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/only agents and group leaders/i);
    });

    it('TC-P05 — missing prospectName returns 400', async () => {
      const { prospectName: _, ...body } = validProspect();
      const res = await createProspect(f.users.agent_star_1.token, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/prospectName/i);
    });

    it('TC-P06 — prospectName too short (1 char) returns 400', async () => {
      const res = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'A' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/prospectName/i);
    });

    it('TC-P07 — invalid email format returns 400', async () => {
      const res = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectEmail: 'not-an-email' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/prospectEmail/i);
    });

    it('TC-P08 — prospect with only prospectName (no email or phone) returns 201', async () => {
      const res = await createProspect(f.users.agent_star_1.token, {
        prospectName: 'Name Only Prospect',
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        prospectId: expect.any(String),
      });
    });
  });

  // ==========================================================================
  // GET /api/prospects/my-prospects
  // ==========================================================================

  describe('GET /api/prospects/my-prospects', () => {
    beforeAll(async () => {
      // Ensure agent_star_1 has at least one prospect
      await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'My Prospect One' }),
      );
    });

    it('TC-P09 — agent sees own prospects', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        '/api/prospects/my-prospects',
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prospects)).toBe(true);
    });

    it('TC-P10 — ?limit=1 returns at most 1 result', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        '/api/prospects/my-prospects?limit=1',
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prospects)).toBe(true);
      expect(res.body.prospects.length).toBeLessThanOrEqual(1);
    });

    it('TC-P11 — unauthenticated request returns 401', async () => {
      const res = await request(app).get('/api/prospects/my-prospects');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /api/prospects/:id
  // ==========================================================================

  describe('GET /api/prospects/:id', () => {
    let starProspectId: string;
    let powerProspectId: string;

    beforeAll(async () => {
      // Prospect owned by agent_star_1 (mdrt_star group)
      const starRes = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Star Prospect For Get' }),
      );
      starProspectId = starRes.body.prospectId as string;

      // Prospect owned by agent_power_1 (sales_power group)
      const powerRes = await createProspect(
        f.users.agent_power_1.token,
        validProspect({ prospectName: 'Power Prospect For Get' }),
      );
      powerProspectId = powerRes.body.prospectId as string;
    });

    it('TC-P12 — admin fetches any prospect', async () => {
      const res = await auth(f.users.admin.token).get(
        `/api/prospects/${starProspectId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.prospect).toBeDefined();
    });

    it('TC-P13 — agent fetches own prospect', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        `/api/prospects/${starProspectId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.prospect).toBeDefined();
    });

    it('TC-P14 — agent fetches another agent\'s prospect returns 403', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        `/api/prospects/${powerProspectId}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-P15 — trainer fetches prospect in managed group', async () => {
      // trainer_star manages mdrt_star, so starProspectId should be visible
      const res = await auth(f.users.trainer_star.token).get(
        `/api/prospects/${starProspectId}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-P16 — non-existent prospect returns 404', async () => {
      const res = await auth(f.users.admin.token).get(
        '/api/prospects/doesnotexist',
      );
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /api/prospects/group/:groupId
  // ==========================================================================

  describe('GET /api/prospects/group/:groupId', () => {
    it('TC-P17 — admin gets group prospects', async () => {
      const res = await auth(f.users.admin.token).get(
        `/api/prospects/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prospects)).toBe(true);
    });

    it('TC-P18 — master_trainer gets group prospects', async () => {
      const res = await auth(f.users.master_trainer.token).get(
        `/api/prospects/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prospects)).toBe(true);
    });

    it('TC-P19 — trainer gets prospects for managed group', async () => {
      const res = await auth(f.users.trainer_star.token).get(
        `/api/prospects/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prospects)).toBe(true);
    });

    it('TC-P20 — trainer blocked from unmanaged group', async () => {
      // trainer_star does not manage sales_power
      const res = await auth(f.users.trainer_star.token).get(
        `/api/prospects/group/${f.groups.sales_power.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-P21 — agent blocked from group prospects', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        `/api/prospects/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-P22 — group leader blocked from group prospects', async () => {
      const res = await auth(f.users.leader_star.token).get(
        `/api/prospects/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // PUT /api/prospects/:id — stage transitions
  // ==========================================================================

  describe('PUT /api/prospects/:id', () => {
    // Each test that modifies state gets its own fresh prospect to avoid order
    // dependencies. All are tracked for cleanup via createProspect().

    it('TC-P23 — prospect → appointment with appointmentDate and optional fields returns 200', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Stage Appt Test' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
          appointmentStartTime: '10:00',
          appointmentEndTime: '11:00',
          appointmentLocation: 'Head Office, Level 3',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-P24 — prospect → appointment missing appointmentDate returns 400', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Stage Appt No Date' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({ currentStage: 'appointment' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/appointmentDate/i);
    });

    it('TC-P25 — appointment → sales_outcome successful with productsSold returns 200', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Sales Success Test' }),
      );
      const id = created.body.prospectId as string;

      // Advance to appointment first
      await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'sales_outcome',
          salesOutcome: 'successful',
          productsSold: [{ productName: 'Life Insurance', aceAmount: 5000 }],
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-P26 — appointment → sales_outcome successful missing productsSold returns 400', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Sales Success No Products' }),
      );
      const id = created.body.prospectId as string;

      await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'sales_outcome',
          salesOutcome: 'successful',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/productsSold/i);
    });

    it('TC-P27 — appointment → sales_outcome unsuccessful with reason returns 200', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Sales Unsuccessful Test' }),
      );
      const id = created.body.prospectId as string;

      await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'sales_outcome',
          salesOutcome: 'unsuccessful',
          unsuccessfulReason: 'Client not interested',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-P28 — appointment → sales_outcome unsuccessful missing reason returns 400', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Sales Unsuccessful No Reason' }),
      );
      const id = created.body.prospectId as string;

      await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'sales_outcome',
          salesOutcome: 'unsuccessful',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/unsuccessfulReason/i);
    });

    it('TC-P41 — appointment → sales_outcome kiv returns 200', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Sales KIV Test' }),
      );
      const id = created.body.prospectId as string;

      await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'sales_outcome',
          salesOutcome: 'kiv',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-P29 — invalid stage value returns 400', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Invalid Stage Test' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({ currentStage: 'closed_deal' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid stage/i);
    });

    it('TC-P30 — invalid appointmentStatus value returns 400', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Invalid AppointmentStatus Test' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({ appointmentStatus: 'unknown_status' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/invalid appointmentStatus/i);
    });

    it('TC-P31 — agent updates another agent\'s prospect returns 403', async () => {
      const created = await createProspect(
        f.users.agent_power_1.token,
        validProspect({ prospectName: 'Power Agent Prospect' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });
      expect(res.status).toBe(403);
    });

    it('TC-P32 — admin updates any prospect', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'Admin Update Test' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.admin.token)
        .put(`/api/prospects/${id}`)
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-P33 — non-existent prospect returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .put('/api/prospects/doesnotexist')
        .send({
          currentStage: 'appointment',
          appointmentDate: '2027-07-01T10:00:00.000Z',
        });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /api/prospects/:id
  // ==========================================================================

  describe('DELETE /api/prospects/:id', () => {
    it('TC-P34 — agent deletes own prospect', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'To Delete By Owner' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token).delete(
        `/api/prospects/${id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Already deleted — remove from cleanup list
      const idx = createdProspectIds.indexOf(id);
      if (idx !== -1) createdProspectIds.splice(idx, 1);
    });

    it('TC-P35 — agent deletes another agent\'s prospect returns 403', async () => {
      const created = await createProspect(
        f.users.agent_power_1.token,
        validProspect({ prospectName: 'Power Prospect For Delete Block' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.agent_star_1.token).delete(
        `/api/prospects/${id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-P36 — admin deletes any prospect', async () => {
      const created = await createProspect(
        f.users.agent_star_1.token,
        validProspect({ prospectName: 'To Delete By Admin' }),
      );
      const id = created.body.prospectId as string;

      const res = await auth(f.users.admin.token).delete(
        `/api/prospects/${id}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const idx = createdProspectIds.indexOf(id);
      if (idx !== -1) createdProspectIds.splice(idx, 1);
    });

    it('TC-P37 — non-existent prospect returns 404', async () => {
      const res = await auth(f.users.admin.token).delete(
        '/api/prospects/doesnotexist',
      );
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /api/admin/all-prospects
  // ==========================================================================

  describe('GET /api/admin/all-prospects', () => {
    it('TC-P38 — admin gets all prospects', async () => {
      const res = await auth(f.users.admin.token).get(
        '/api/admin/all-prospects',
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.prospects)).toBe(true);
    });

    it('TC-P39 — non-admin (agent) is blocked', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        '/api/admin/all-prospects',
      );
      expect(res.status).toBe(403);
    });

    it('TC-P40 — non-admin (trainer) is blocked', async () => {
      const res = await auth(f.users.trainer_star.token).get(
        '/api/admin/all-prospects',
      );
      expect(res.status).toBe(403);
    });
  });
});
