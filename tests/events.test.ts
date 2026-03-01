/**
 * Events API — Integration Tests
 *
 * Covers all cases from the test plan:
 *   POST   /api/events
 *   GET    /api/events/my-events
 *   GET    /api/events
 *   GET    /api/events/:eventId
 *   PUT    /api/events/:eventId
 *   DELETE /api/events/:eventId
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

/** Minimal valid event body — override individual fields per test */
function validEvent(groupIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    eventTitle: 'Weekly Standup',
    date: '2027-06-01T09:00:00.000Z',
    venue: 'Training Room A',
    description: 'A description that is long enough to pass validation.',
    groupIds,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Events API', () => {
  let f: Fixtures;

  // Created event IDs — cleaned up in afterAll
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    f = await getFixtures();
  });

  afterAll(async () => {
    // Best-effort cleanup: delete all events created during tests
    const { default: adminPkg } = await import('firebase-admin');
    const db = adminPkg.firestore();
    await Promise.all(
      createdEventIds.map((id) => db.collection('events').doc(id).delete()),
    );
  });

  // ── Helper to create an event and track its ID for cleanup ──────────────
  async function createEvent(token: string, body: object): Promise<request.Response> {
    const res = await auth(token).post('/api/events').send(body);
    if (res.status === 201 && res.body.eventId) {
      createdEventIds.push(res.body.eventId as string);
    }
    return res;
  }

  // ==========================================================================
  // POST /api/events
  // ==========================================================================

  describe('POST /api/events', () => {
    // ── Happy paths ─────────────────────────────────────────────────────────

    it('TC-E01 — admin creates a valid event', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        eventId: expect.any(String),
        message: 'Event created successfully',
      });
    });

    it('TC-E02 — admin creates event with optional meetingLink', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], {
          meetingLink: 'https://meet.google.com/abc-defg-hij',
        }),
      );
      expect(res.status).toBe(201);
    });

    it('TC-E03 — trainer creates event for managed group', async () => {
      const res = await createEvent(
        f.users.trainer_star.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      expect(res.status).toBe(201);
    });

    it('TC-E04 — trainer cannot create event for unmanaged group', async () => {
      const res = await createEvent(
        f.users.trainer_star.token,
        validEvent([f.groups.sales_power.id]),
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/do not manage/i);
    });

    it('TC-E05 — group leader creates event for own group', async () => {
      const res = await createEvent(
        f.users.leader_star.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      expect(res.status).toBe(201);
    });

    it('TC-E06 — group leader cannot create event for another group', async () => {
      const res = await createEvent(
        f.users.leader_star.token,
        validEvent([f.groups.sales_power.id]),
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/own group/i);
    });

    it('TC-E07 — agent cannot create events', async () => {
      const res = await createEvent(
        f.users.agent_star_1.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      expect(res.status).toBe(403);
    });

    it('TC-E17 — unauthenticated request is rejected', async () => {
      const res = await request(app)
        .post('/api/events')
        .send(validEvent([f.groups.mdrt_star.id]));
      expect(res.status).toBe(401);
    });

    // ── Validation ───────────────────────────────────────────────────────────

    it('TC-E08 — missing eventTitle', async () => {
      const { eventTitle: _, ...body } = validEvent([f.groups.mdrt_star.id]);
      const res = await createEvent(f.users.admin.token, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/eventTitle/i);
    });

    it('TC-E09 — eventTitle too short (< 3 chars)', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], { eventTitle: 'Hi' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/eventTitle/i);
    });

    it('TC-E10 — missing date', async () => {
      const { date: _, ...body } = validEvent([f.groups.mdrt_star.id]);
      const res = await createEvent(f.users.admin.token, body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/date/i);
    });

    it('TC-E11 — invalid date format', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], { date: 'not-a-date' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/date/i);
    });

    it('TC-E12 — venue too short (< 3 chars)', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], { venue: 'AB' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/venue/i);
    });

    it('TC-E13 — description too short (< 10 chars)', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], { description: 'Short' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/description/i);
    });

    it('TC-E14 — empty groupIds array', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], { groupIds: [] }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/groupIds/i);
    });

    it('TC-E15 — groupIds references non-existent group', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent(['nonexistent-group-id']),
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/group/i);
    });

    it('TC-E16 — invalid meetingLink', async () => {
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id], { meetingLink: 'not-a-url' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/meetingLink/i);
    });

    it('TC-E89 — meetingLink is optional (omitted)', async () => {
      const body = validEvent([f.groups.mdrt_star.id]);
      const res = await createEvent(f.users.admin.token, body);
      expect(res.status).toBe(201);
    });
  });

  // ==========================================================================
  // GET /api/events/my-events
  // ==========================================================================

  describe('GET /api/events/my-events', () => {
    it('TC-E18 — admin sees all upcoming events', async () => {
      const res = await auth(f.users.admin.token).get('/api/events/my-events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
      // All returned events must be upcoming
      for (const event of res.body.events) {
        expect(event.status).toBe('upcoming');
      }
    });

    it('TC-E19 — trainer sees only events for managed groups', async () => {
      const res = await auth(f.users.trainer_star.token).get('/api/events/my-events');
      expect(res.status).toBe(200);
      // No event should belong exclusively to a group not managed by this trainer
      for (const event of res.body.events) {
        const hasManaged = (event.groupIds as string[]).includes(f.groups.mdrt_star.id);
        expect(hasManaged).toBe(true);
      }
    });

    it('TC-E21 — agent sees only events for own group', async () => {
      const res = await auth(f.users.agent_star_1.token).get('/api/events/my-events');
      expect(res.status).toBe(200);
      for (const event of res.body.events) {
        expect((event.groupIds as string[]).includes(f.groups.mdrt_star.id)).toBe(true);
      }
    });

    it('TC-N1 — smoke test: my-events resolves before :eventId param', async () => {
      // If routing is broken, "my-events" would be treated as an eventId → 404
      const res = await auth(f.users.admin.token).get('/api/events/my-events');
      expect(res.status).not.toBe(404);
      expect(res.body).toHaveProperty('events');
    });

    it('TC-E23 — unauthenticated', async () => {
      const res = await request(app).get('/api/events/my-events');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /api/events
  // ==========================================================================

  describe('GET /api/events', () => {
    it('TC-E24 — admin gets all events', async () => {
      const res = await auth(f.users.admin.token).get('/api/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.events)).toBe(true);
    });

    it('TC-E25 — admin filters by status=upcoming', async () => {
      const res = await auth(f.users.admin.token).get('/api/events?status=upcoming');
      expect(res.status).toBe(200);
      for (const event of res.body.events) {
        expect(event.status).toBe('upcoming');
      }
    });

    it('TC-E26 — admin filters by groupId', async () => {
      const res = await auth(f.users.admin.token).get(
        `/api/events?groupId=${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
      for (const event of res.body.events) {
        expect((event.groupIds as string[]).includes(f.groups.mdrt_star.id)).toBe(true);
      }
    });

    it('TC-E28 — trainer cannot access GET /events', async () => {
      const res = await auth(f.users.trainer_star.token).get('/api/events');
      expect(res.status).toBe(403);
    });

    it('TC-E28b — agent cannot access GET /events', async () => {
      const res = await auth(f.users.agent_star_1.token).get('/api/events');
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // GET /api/events/:eventId
  // ==========================================================================

  describe('GET /api/events/:eventId', () => {
    let starEventId: string;

    beforeAll(async () => {
      // Create one event for MDRT Star to use in read tests
      const res = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      starEventId = res.body.eventId as string;
    });

    it('TC-E29 — admin fetches any event', async () => {
      const res = await auth(f.users.admin.token).get(`/api/events/${starEventId}`);
      expect(res.status).toBe(200);
      expect(res.body.event.id).toBe(starEventId);
    });

    it('TC-E30 — trainer fetches event for managed group', async () => {
      const res = await auth(f.users.trainer_star.token).get(`/api/events/${starEventId}`);
      expect(res.status).toBe(200);
    });

    it('TC-E31 — trainer cannot fetch event for unmanaged group', async () => {
      // Create an event only for Sales Power (unmanaged by trainer_star)
      const powerRes = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.sales_power.id]),
      );
      const powerEventId = powerRes.body.eventId as string;

      const res = await auth(f.users.trainer_star.token).get(`/api/events/${powerEventId}`);
      expect(res.status).toBe(403);
    });

    it('TC-E32 — agent fetches event for own group', async () => {
      const res = await auth(f.users.agent_star_1.token).get(`/api/events/${starEventId}`);
      expect(res.status).toBe(200);
    });

    it('TC-E33 — agent cannot fetch event for a different group', async () => {
      const powerRes = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.sales_power.id]),
      );
      const powerEventId = powerRes.body.eventId as string;

      // agent_star_1 is in MDRT Star, not Sales Power
      const res = await auth(f.users.agent_star_1.token).get(`/api/events/${powerEventId}`);
      expect(res.status).toBe(403);
    });

    it('TC-E34 — non-existent event returns 404', async () => {
      const res = await auth(f.users.admin.token).get('/api/events/doesnotexist');
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // PUT /api/events/:eventId
  // ==========================================================================

  describe('PUT /api/events/:eventId', () => {
    let adminEventId: string;
    let trainerEventId: string;

    beforeAll(async () => {
      const adminRes = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      adminEventId = adminRes.body.eventId as string;

      const trainerRes = await createEvent(
        f.users.trainer_star.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      trainerEventId = trainerRes.body.eventId as string;
    });

    it('TC-E35 — admin updates any event', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({ eventTitle: 'Updated By Admin' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-E36 — creator updates own event', async () => {
      const res = await auth(f.users.trainer_star.token)
        .put(`/api/events/${trainerEventId}`)
        .send({ venue: 'New Venue Here' });
      expect(res.status).toBe(200);
    });

    it('TC-E37 — non-creator non-admin cannot update', async () => {
      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/events/${adminEventId}`)
        .send({ eventTitle: 'Hacked' });
      expect(res.status).toBe(403);
    });

    it('TC-E38 — empty body is rejected', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least one field/i);
    });

    it('TC-E39 — invalid status value', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({ status: 'archived' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/status/i);
    });

    it('TC-E35b — admin can change status to completed', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({ status: 'completed' });
      expect(res.status).toBe(200);
    });

    it('TC-E40 — trainer cannot reassign event to unmanaged group', async () => {
      const res = await auth(f.users.trainer_star.token)
        .put(`/api/events/${trainerEventId}`)
        .send({ groupIds: [f.groups.sales_power.id] });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/do not manage/i);
    });

    it('TC-E41 — update groupIds to non-existent group returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({ groupIds: ['doesnotexist'] });
      expect(res.status).toBe(404);
    });

    it('TC-E42 — invalid meetingLink on update', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({ meetingLink: 'not-a-url' });
      expect(res.status).toBe(400);
    });

    it('TC-E43 — empty groupIds array on update', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/events/${adminEventId}`)
        .send({ groupIds: [] });
      expect(res.status).toBe(400);
    });

    it('TC-E44 — non-existent event returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .put('/api/events/doesnotexist')
        .send({ eventTitle: 'Whatever' });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /api/events/:eventId
  // ==========================================================================

  describe('DELETE /api/events/:eventId', () => {
    it('TC-E45 — admin deletes any event', async () => {
      const created = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      const eventId = created.body.eventId as string;

      const res = await auth(f.users.admin.token).delete(`/api/events/${eventId}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Remove from cleanup list since already deleted
      const idx = createdEventIds.indexOf(eventId);
      if (idx !== -1) createdEventIds.splice(idx, 1);
    });

    it('TC-E46 — creator deletes own event', async () => {
      const created = await createEvent(
        f.users.trainer_star.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      const eventId = created.body.eventId as string;

      const res = await auth(f.users.trainer_star.token).delete(`/api/events/${eventId}`);
      expect(res.status).toBe(200);

      const idx = createdEventIds.indexOf(eventId);
      if (idx !== -1) createdEventIds.splice(idx, 1);
    });

    it('TC-E47 — non-creator non-admin cannot delete', async () => {
      const created = await createEvent(
        f.users.admin.token,
        validEvent([f.groups.mdrt_star.id]),
      );
      const eventId = created.body.eventId as string;

      const res = await auth(f.users.agent_star_1.token).delete(`/api/events/${eventId}`);
      expect(res.status).toBe(403);
    });

    it('TC-E48 — non-existent event returns 404', async () => {
      const res = await auth(f.users.admin.token).delete('/api/events/doesnotexist');
      expect(res.status).toBe(404);
    });
  });
});
