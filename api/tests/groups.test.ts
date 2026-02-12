/**
 * Groups API — Integration Tests
 *
 * Covers all cases from the test plan:
 *   POST   /api/admin/groups
 *   GET    /api/groups
 *   GET    /api/groups/:groupId
 *   PUT    /api/admin/groups/:groupId
 *   DELETE /api/admin/groups/:groupId
 *
 * Ephemeral groups and their owners:
 *   TC-G01 create test  → trainer_legend + leader_legend + agent_legend
 *   PUT tests           → trainer_avengers + leader_avengers + agent_avengers
 *   DELETE test (TC-G25)→ trainer_busters + leader_busters + agent_busters
 *
 * All created group docs are removed in afterAll; affected users are fully
 * restored to their original groupId / groupName / role values.
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Groups API', () => {
  let f: Fixtures;

  /** IDs of every group doc created during the suite — deleted in afterAll. */
  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    f = await getFixtures();
  });

  afterAll(async () => {
    const { default: adminPkg } = await import('firebase-admin');
    const db = adminPkg.firestore();

    // Delete all ephemeral group documents (Firestore delete is a no-op if
    // the doc is already gone, e.g. consumed by TC-G25).
    await Promise.all(
      createdGroupIds.map((id) => db.collection('groups').doc(id).delete()),
    );

    // Restore every user whose groupId / role was mutated by the tests.
    await Promise.all([
      // --- TC-G01 temp group used trainer_legend, leader_legend, agent_legend ---
      db.collection('users').doc(f.users.trainer_legend.uid).update({
        managedGroupIds: [f.groups.mdrt_legend.id],
      }),
      db.collection('users').doc(f.users.leader_legend.uid).update({
        groupId: f.groups.mdrt_legend.id,
        groupName: f.groups.mdrt_legend.name,
        role: 'group_leader',
      }),
      db.collection('users').doc(f.users.agent_legend.uid).update({
        groupId: f.groups.mdrt_legend.id,
        groupName: f.groups.mdrt_legend.name,
        role: 'agent',
      }),

      // --- PUT temp group used trainer_avengers, leader_avengers, agent_avengers ---
      // TC-G19 swapped trainer to trainer_busters, TC-G20 swapped leader to agent_avengers.
      db.collection('users').doc(f.users.trainer_avengers.uid).update({
        managedGroupIds: [f.groups.agent_avengers.id],
      }),
      db.collection('users').doc(f.users.leader_avengers.uid).update({
        groupId: f.groups.agent_avengers.id,
        groupName: f.groups.agent_avengers.name,
        role: 'group_leader',
      }),
      db.collection('users').doc(f.users.agent_avengers.uid).update({
        groupId: f.groups.agent_avengers.id,
        groupName: f.groups.agent_avengers.name,
        role: 'agent',
      }),

      // --- DELETE temp group and TC-G19 used trainer_busters, leader_busters, agent_busters ---
      db.collection('users').doc(f.users.trainer_busters.uid).update({
        managedGroupIds: [f.groups.kpi_busters.id],
      }),
      db.collection('users').doc(f.users.leader_busters.uid).update({
        groupId: f.groups.kpi_busters.id,
        groupName: f.groups.kpi_busters.name,
        role: 'group_leader',
      }),
      db.collection('users').doc(f.users.agent_busters.uid).update({
        groupId: f.groups.kpi_busters.id,
        groupName: f.groups.kpi_busters.name,
        role: 'agent',
      }),
    ]);
  });

  // Helper: POST /admin/groups and track the new ID for cleanup.
  async function createGroup(token: string, body: object): Promise<request.Response> {
    const res = await auth(token).post('/api/admin/groups').send(body);
    if (res.status === 201 && res.body.groupId) {
      createdGroupIds.push(res.body.groupId as string);
    }
    return res;
  }

  // ==========================================================================
  // POST /admin/groups
  // ==========================================================================

  describe('POST /admin/groups', () => {
    it('TC-G01 — admin creates a group', async () => {
      const res = await createGroup(f.users.admin.token, {
        name: 'Alpha Test Group',
        trainerIds: [f.users.trainer_legend.uid],
        leaderId: f.users.leader_legend.uid,
        memberIds: [f.users.leader_legend.uid, f.users.agent_legend.uid],
      });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        groupId: expect.any(String),
        message: 'Group created successfully',
      });
    });

    it('TC-G02 — non-admin cannot create a group', async () => {
      const res = await auth(f.users.agent_star_1.token)
        .post('/api/admin/groups')
        .send({
          name: 'Sneaky Group',
          trainerIds: [f.users.trainer_star.uid],
          leaderId: f.users.agent_star_1.uid,
          memberIds: [f.users.agent_star_1.uid],
        });
      expect(res.status).toBe(403);
    });

    it('TC-G03 — group name too short (< 3 chars)', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'AB',
          trainerIds: [f.users.trainer_star.uid],
          leaderId: f.users.agent_star_1.uid,
          memberIds: [f.users.agent_star_1.uid],
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/group name/i);
    });

    it('TC-G04 — name only (no trainers, leader, or members)', async () => {
      const res = await createGroup(f.users.admin.token, {
        name: 'Name Only Group',
      });
      expect(res.status).toBe(201);
      expect(res.body.groupId).toBeDefined();
    });

    it('TC-G04b — trainer only (no leader or members)', async () => {
      const res = await createGroup(f.users.admin.token, {
        name: 'Trainer Only Group',
        trainerIds: [f.users.trainer_legend.uid],
      });
      expect(res.status).toBe(201);
    });

    it('TC-G04c — members only (no trainer or leader)', async () => {
      const res = await createGroup(f.users.admin.token, {
        name: 'Members Only Group',
        memberIds: [f.users.agent_legend.uid],
      });
      expect(res.status).toBe(201);
    });

    it('TC-G04d — leader and members only (no trainer)', async () => {
      const res = await createGroup(f.users.admin.token, {
        name: 'Leader Members Group',
        leaderId: f.users.leader_legend.uid,
        memberIds: [f.users.leader_legend.uid, f.users.agent_legend.uid],
      });
      expect(res.status).toBe(201);
    });

    it('TC-G05 — leaderId not included in memberIds', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Valid Group Name',
          trainerIds: [f.users.trainer_star.uid],
          leaderId: f.users.agent_star_1.uid,
          memberIds: [f.users.agent_star_2.uid], // leader is absent
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/leader must be included/i);
    });

    it('TC-G06 — non-trainer user in trainerIds returns 403 or 404', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Valid Group Name',
          trainerIds: [f.users.agent_star_1.uid], // agent, not a trainer
          leaderId: f.users.agent_star_1.uid,
          memberIds: [f.users.agent_star_1.uid],
        });
      expect([403, 404]).toContain(res.status);
    });

    it('TC-G07 — non-existent leaderId returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Valid Group Name',
          trainerIds: [f.users.trainer_star.uid],
          leaderId: 'nonexistent-uid',
          memberIds: ['nonexistent-uid'],
        });
      expect(res.status).toBe(404);
    });

    it('TC-G07b — leaderId pointing to a trainer (ineligible role) returns 403', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Valid Group Name',
          leaderId: f.users.trainer_star.uid,
          memberIds: [f.users.trainer_star.uid],
        });
      expect(res.status).toBe(403);
    });

    it('TC-G07c — memberIds containing a non-existent user returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Valid Group Name',
          memberIds: ['nonexistent-member-uid'],
        });
      expect(res.status).toBe(404);
    });

    it('TC-G07d — trainerIds provided as non-array returns 400', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Valid Group Name',
          trainerIds: f.users.trainer_star.uid, // string instead of array
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/trainerIds must be an array/i);
    });
  });

  // ==========================================================================
  // GET /groups
  // ==========================================================================

  describe('GET /groups', () => {
    it('TC-G08 — admin sees all groups', async () => {
      const res = await auth(f.users.admin.token).get('/api/groups');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.groups)).toBe(true);
      const ids = (res.body.groups as { id: string }[]).map((g) => g.id);
      expect(ids).toContain(f.groups.mdrt_star.id);
      expect(ids).toContain(f.groups.sales_power.id);
    });

    it('TC-G09 — master_trainer sees all groups', async () => {
      const res = await auth(f.users.master_trainer.token).get('/api/groups');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.groups)).toBe(true);
      const ids = (res.body.groups as { id: string }[]).map((g) => g.id);
      expect(ids).toContain(f.groups.mdrt_star.id);
      expect(ids).toContain(f.groups.sales_power.id);
    });

    it('TC-G10 — trainer sees only managed groups', async () => {
      const res = await auth(f.users.trainer_star.token).get('/api/groups');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.groups)).toBe(true);
      const ids = (res.body.groups as { id: string }[]).map((g) => g.id);
      // trainer_star manages mdrt_star only
      expect(ids).toContain(f.groups.mdrt_star.id);
      expect(ids).not.toContain(f.groups.sales_power.id);
    });

    it('TC-G11 — group_leader sees only own group', async () => {
      const res = await auth(f.users.leader_star.token).get('/api/groups');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.groups)).toBe(true);
      expect(res.body.groups).toHaveLength(1);
      expect((res.body.groups as { id: string }[])[0].id).toBe(f.groups.mdrt_star.id);
    });

    it('TC-G12 — agent gets 403', async () => {
      const res = await auth(f.users.agent_star_1.token).get('/api/groups');
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // GET /groups/:groupId
  // ==========================================================================

  describe('GET /groups/:groupId', () => {
    it('TC-G13 — admin fetches group with member details', async () => {
      const res = await auth(f.users.admin.token).get(`/api/groups/${f.groups.mdrt_star.id}`);
      expect(res.status).toBe(200);
      expect(res.body.group).toBeDefined();
      expect(res.body.group.id).toBe(f.groups.mdrt_star.id);
      expect(Array.isArray(res.body.members)).toBe(true);
    });

    it('TC-G14 — trainer fetches managed group', async () => {
      const res = await auth(f.users.trainer_star.token).get(
        `/api/groups/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-G15 — trainer cannot fetch unmanaged group', async () => {
      // trainer_star manages mdrt_star, not sales_power
      const res = await auth(f.users.trainer_star.token).get(
        `/api/groups/${f.groups.sales_power.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-G16 — group_leader fetches own group', async () => {
      const res = await auth(f.users.leader_star.token).get(
        `/api/groups/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-G17 — non-existent group returns 404', async () => {
      const res = await auth(f.users.admin.token).get('/api/groups/doesnotexist');
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // PUT /admin/groups/:groupId
  // ==========================================================================

  describe('PUT /admin/groups/:groupId', () => {
    let updateGroupId: string;

    beforeAll(async () => {
      // Create a dedicated temp group for all update tests.
      // Uses avengers users so they don't collide with stable test groups.
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Update Test Group',
          trainerIds: [f.users.trainer_avengers.uid],
          leaderId: f.users.leader_avengers.uid,
          memberIds: [f.users.leader_avengers.uid, f.users.agent_avengers.uid],
        });
      expect(res.status).toBe(201);
      updateGroupId = res.body.groupId as string;
      createdGroupIds.push(updateGroupId);
    });

    it('TC-G18 — admin renames group', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/admin/groups/${updateGroupId}`)
        .send({ name: 'Renamed Update Group' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'Group updated successfully' });
    });

    it('TC-G19 — admin replaces trainer', async () => {
      // Swap trainer_avengers → trainer_busters
      const res = await auth(f.users.admin.token)
        .put(`/api/admin/groups/${updateGroupId}`)
        .send({ trainerIds: [f.users.trainer_busters.uid] });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-G20 — admin changes leader (demotes old, promotes new)', async () => {
      // Swap leader_avengers → agent_avengers; both must be in memberIds
      const res = await auth(f.users.admin.token)
        .put(`/api/admin/groups/${updateGroupId}`)
        .send({
          leaderId: f.users.agent_avengers.uid,
          memberIds: [f.users.leader_avengers.uid, f.users.agent_avengers.uid],
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-G21 — new leaderId not in memberIds is rejected', async () => {
      // agent_star_1 is not a member of the temp group
      const res = await auth(f.users.admin.token)
        .put(`/api/admin/groups/${updateGroupId}`)
        .send({ leaderId: f.users.agent_star_1.uid });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/new leader must be included/i);
    });

    it('TC-G22 — empty body is rejected', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/admin/groups/${updateGroupId}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/at least one field/i);
    });

    it('TC-G23 — non-admin cannot update group', async () => {
      const res = await auth(f.users.trainer_star.token)
        .put(`/api/admin/groups/${updateGroupId}`)
        .send({ name: 'Hacked Name' });
      expect(res.status).toBe(403);
    });

    it('TC-G24 — non-existent group returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .put('/api/admin/groups/doesnotexist')
        .send({ name: 'Whatever' });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /admin/groups/:groupId
  // ==========================================================================

  describe('DELETE /admin/groups/:groupId', () => {
    let deleteGroupId: string;

    beforeAll(async () => {
      // Create a dedicated group to be consumed by TC-G25.
      // Uses busters users (not colliding with PUT-test avengers users).
      const res = await auth(f.users.admin.token)
        .post('/api/admin/groups')
        .send({
          name: 'Delete Target Group',
          trainerIds: [f.users.trainer_busters.uid],
          leaderId: f.users.leader_busters.uid,
          memberIds: [f.users.leader_busters.uid, f.users.agent_busters.uid],
        });
      expect(res.status).toBe(201);
      deleteGroupId = res.body.groupId as string;
      // Track for afterAll cleanup (no-op if TC-G25 already deleted it).
      createdGroupIds.push(deleteGroupId);
    });

    it('TC-G25 — admin deletes a group', async () => {
      const res = await auth(f.users.admin.token).delete(
        `/api/admin/groups/${deleteGroupId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'Group deleted successfully' });

      // Verify the group is gone
      const check = await auth(f.users.admin.token).get(`/api/groups/${deleteGroupId}`);
      expect(check.status).toBe(404);
    });

    it('TC-G26 — non-admin cannot delete group', async () => {
      // trainer_star attempts to delete mdrt_star — admin-only route
      const res = await auth(f.users.trainer_star.token).delete(
        `/api/admin/groups/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-G27 — non-existent group returns 404', async () => {
      const res = await auth(f.users.admin.token).delete('/api/admin/groups/doesnotexist');
      expect(res.status).toBe(404);
    });
  });
});
