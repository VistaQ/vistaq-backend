/**
 * Users API — Integration Tests
 *
 * Covers TC-U01 through TC-U40:
 *   GET    /api/users/me
 *   GET    /api/users/:userId
 *   GET    /api/users
 *   GET    /api/users/group/:groupId
 *   PUT    /api/users/:userId
 *   PATCH  /api/admin/users/:userId/status
 *   DELETE /api/admin/users/:userId
 *
 * Mutation target: agent_power_2 (agent in sales_power).
 * Temp user created via admin API for TC-U36 delete test.
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

describe('Users API', () => {
  let f: Fixtures;

  // Values saved in beforeAll and used in afterAll to restore agent_power_2
  // and the sales_power group leadership after TC-U26 (role promotion).
  let originalAgent2Name: string;
  let originalLeaderPowerName: string;
  let originalLeaderPowerEmail: string;

  // UID of the temp user created for TC-U36; '' means it was already deleted.
  let tempDeleteUserId = '';

  beforeAll(async () => {
    f = await getFixtures();

    const { default: adminPkg } = await import('firebase-admin');
    const db = adminPkg.firestore();

    const [agent2Doc, leaderPowerDoc] = await Promise.all([
      db.collection('users').doc(f.users.agent_power_2.uid).get(),
      db.collection('users').doc(f.users.leader_power.uid).get(),
    ]);

    originalAgent2Name = agent2Doc.data()?.name as string;
    originalLeaderPowerName = leaderPowerDoc.data()?.name as string;
    originalLeaderPowerEmail = leaderPowerDoc.data()?.email as string;
  });

  afterAll(async () => {
    const { default: adminPkg } = await import('firebase-admin');
    const db = adminPkg.firestore();

    await Promise.all([
      // Restore agent_power_2 to original state
      db.collection('users').doc(f.users.agent_power_2.uid).update({
        name: originalAgent2Name,
        role: 'agent',
        status: 'active',
        phone: null,
        location: null,
        agency: null,
      }),
      // Restore sales_power group leadership (TC-U26 may have changed it)
      db.collection('groups').doc(f.groups.sales_power.id).update({
        leaderId: f.users.leader_power.uid,
        leaderName: originalLeaderPowerName,
        leaderEmail: originalLeaderPowerEmail,
      }),
    ]);

    // Re-enable agent_power_2 in Firebase Auth (TC-U31 may have disabled them)
    try {
      await adminPkg.auth().updateUser(f.users.agent_power_2.uid, { disabled: false });
    } catch {
      // Ignore — account may already be enabled
    }

    // Best-effort cleanup of the temp delete user if TC-U36 didn't finish
    if (tempDeleteUserId) {
      try {
        await db.collection('users').doc(tempDeleteUserId).delete();
        await adminPkg.auth().deleteUser(tempDeleteUserId);
      } catch {
        // Already deleted — no-op
      }
    }
  });

  // ==========================================================================
  // GET /users/me
  // ==========================================================================

  describe('GET /users/me', () => {
    it('TC-U01 — authenticated user gets own profile', async () => {
      const res = await auth(f.users.agent_star_1.token).get('/api/users/me');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.uid).toBe(f.users.agent_star_1.uid);
      expect(res.body.user.role).toBe('agent');
    });

    it('TC-U02 — unauthenticated returns 401', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
    });
  });

  // ==========================================================================
  // GET /users/:userId
  // ==========================================================================

  describe('GET /users/:userId', () => {
    it('TC-U03 — admin fetches any user', async () => {
      const res = await auth(f.users.admin.token).get(
        `/api/users/${f.users.agent_star_1.uid}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.user.uid).toBe(f.users.agent_star_1.uid);
    });

    it('TC-U04 — trainer fetches user in managed group', async () => {
      // trainer_star manages mdrt_star; agent_star_1 is in mdrt_star
      const res = await auth(f.users.trainer_star.token).get(
        `/api/users/${f.users.agent_star_1.uid}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-U05 — trainer cannot fetch user in unmanaged group', async () => {
      // trainer_star does NOT manage sales_power; agent_power_1 is in sales_power
      const res = await auth(f.users.trainer_star.token).get(
        `/api/users/${f.users.agent_power_1.uid}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-U06 — user fetches self', async () => {
      const res = await auth(f.users.agent_star_1.token).get(
        `/api/users/${f.users.agent_star_1.uid}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-U07 — group_leader fetches member of own group', async () => {
      // leader_star and agent_star_1 are both in mdrt_star
      const res = await auth(f.users.leader_star.token).get(
        `/api/users/${f.users.agent_star_1.uid}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-U08 — group_leader cannot fetch user in a different group', async () => {
      // leader_star is in mdrt_star; agent_power_1 is in sales_power
      const res = await auth(f.users.leader_star.token).get(
        `/api/users/${f.users.agent_power_1.uid}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-U09 — non-existent user returns 404', async () => {
      const res = await auth(f.users.admin.token).get('/api/users/doesnotexist');
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // GET /users
  // ==========================================================================

  describe('GET /users', () => {
    it('TC-U10 — admin gets all users', async () => {
      const res = await auth(f.users.admin.token).get('/api/users');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBeGreaterThan(0);
    });

    it('TC-U11 — admin filters by role=agent', async () => {
      const res = await auth(f.users.admin.token).get('/api/users?role=agent');
      expect(res.status).toBe(200);
      for (const user of res.body.users as { role: string }[]) {
        expect(user.role).toBe('agent');
      }
    });

    it('TC-U12 — admin filters by groupId', async () => {
      const res = await auth(f.users.admin.token).get(
        `/api/users?groupId=${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
      for (const user of res.body.users as { groupId: string }[]) {
        expect(user.groupId).toBe(f.groups.mdrt_star.id);
      }
    });

    it('TC-U13 — admin filters by status=active', async () => {
      const res = await auth(f.users.admin.token).get('/api/users?status=active');
      expect(res.status).toBe(200);
      for (const user of res.body.users as { status: string }[]) {
        expect(user.status).toBe('active');
      }
    });

    it('TC-U14 — trainer sees only users in managed groups', async () => {
      const res = await auth(f.users.trainer_star.token).get('/api/users');
      expect(res.status).toBe(200);
      // trainer_star manages only mdrt_star — every returned user must be in that group
      for (const user of res.body.users as { groupId: string }[]) {
        expect(user.groupId).toBe(f.groups.mdrt_star.id);
      }
    });

    it('TC-U15 — agent gets 403', async () => {
      const res = await auth(f.users.agent_star_1.token).get('/api/users');
      expect(res.status).toBe(403);
    });
  });

  // ==========================================================================
  // GET /users/group/:groupId
  // ==========================================================================

  describe('GET /users/group/:groupId', () => {
    it('TC-U16 — admin fetches users in a group', async () => {
      const res = await auth(f.users.admin.token).get(
        `/api/users/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(typeof res.body.groupName).toBe('string');
    });

    it('TC-U17 — trainer fetches users in managed group', async () => {
      const res = await auth(f.users.trainer_star.token).get(
        `/api/users/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-U18 — trainer cannot fetch users in unmanaged group', async () => {
      const res = await auth(f.users.trainer_star.token).get(
        `/api/users/group/${f.groups.sales_power.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-U19 — group_leader fetches users in own group', async () => {
      const res = await auth(f.users.leader_star.token).get(
        `/api/users/group/${f.groups.mdrt_star.id}`,
      );
      expect(res.status).toBe(200);
    });

    it('TC-U20 — group_leader cannot fetch users in other group', async () => {
      const res = await auth(f.users.leader_star.token).get(
        `/api/users/group/${f.groups.sales_power.id}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-U21 — non-existent group returns 404', async () => {
      const res = await auth(f.users.admin.token).get('/api/users/group/doesnotexist');
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // PUT /users/:userId
  // ==========================================================================

  describe('PUT /users/:userId', () => {
    it('TC-U22 — admin updates name and agency', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({ name: 'Updated By Admin', agency: 'New Agency Corp' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'User updated successfully' });
    });

    it('TC-U23 — user updates own allowed fields (name, phone, location)', async () => {
      const res = await auth(f.users.agent_power_2.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({ name: 'Self Updated', phone: '0123456789', location: 'Kuala Lumpur' });
      expect(res.status).toBe(200);
    });

    it('TC-U24 — user cannot update own restricted fields', async () => {
      const res = await auth(f.users.agent_power_2.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({ role: 'admin' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/name, phone, and location/i);
    });

    it('TC-U25 — user cannot update another user', async () => {
      // agent_star_1 tries to modify agent_power_2
      const res = await auth(f.users.agent_star_1.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({ name: 'Hacked' });
      expect(res.status).toBe(403);
    });

    it('TC-U26 — admin promotes agent to group_leader', async () => {
      // agent_power_2 is in sales_power — promotion also updates sales_power.leaderId
      const res = await auth(f.users.admin.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({ role: 'group_leader' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-U27 — admin cannot change role to trainer while user is in a group', async () => {
      // agent_star_1 has groupId (mdrt_star) → cannot become trainer
      const res = await auth(f.users.admin.token)
        .put(`/api/users/${f.users.agent_star_1.uid}`)
        .send({ role: 'trainer' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/trainers cannot be members of groups/i);
    });

    it('TC-U28 — admin cannot change trainer role while trainer manages groups', async () => {
      // trainer_star manages mdrt_star → cannot change to agent
      const res = await auth(f.users.admin.token)
        .put(`/api/users/${f.users.trainer_star.uid}`)
        .send({ role: 'agent' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot change role while managing groups/i);
    });

    it('TC-U29 — admin update to an already-used email returns 409', async () => {
      const res = await auth(f.users.admin.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({ email: f.users.admin.email });
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/email already in use/i);
    });

    it('TC-U30 — empty body returns 400', async () => {
      const res = await auth(f.users.agent_power_2.token)
        .put(`/api/users/${f.users.agent_power_2.uid}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/no valid fields/i);
    });
  });

  // ==========================================================================
  // PATCH /admin/users/:userId/status
  // ==========================================================================

  describe('PATCH /admin/users/:userId/status', () => {
    it('TC-U31 — admin sets user inactive', async () => {
      const res = await auth(f.users.admin.token)
        .patch(`/api/admin/users/${f.users.agent_power_2.uid}/status`)
        .send({ status: 'inactive' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-U32 — admin sets user active', async () => {
      const res = await auth(f.users.admin.token)
        .patch(`/api/admin/users/${f.users.agent_power_2.uid}/status`)
        .send({ status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('TC-U33 — invalid status value returns 400', async () => {
      const res = await auth(f.users.admin.token)
        .patch(`/api/admin/users/${f.users.agent_power_2.uid}/status`)
        .send({ status: 'banned' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/active.*inactive/i);
    });

    it('TC-U34 — non-admin gets 403', async () => {
      const res = await auth(f.users.agent_star_1.token)
        .patch(`/api/admin/users/${f.users.agent_power_2.uid}/status`)
        .send({ status: 'inactive' });
      expect(res.status).toBe(403);
    });

    it('TC-U35 — non-existent user returns 404', async () => {
      const res = await auth(f.users.admin.token)
        .patch('/api/admin/users/doesnotexist/status')
        .send({ status: 'inactive' });
      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // DELETE /admin/users/:userId
  // ==========================================================================

  describe('DELETE /admin/users/:userId', () => {
    beforeAll(async () => {
      // Create a throwaway user specifically for TC-U36.
      // Using a fixed email/agentCode so afterAll can clean up on failure.
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'temp.delete.test@vistaq.test',
          password: 'TestPass123!',
          name: 'Temp Delete User',
          role: 'agent',
          agentCode: 'TDU001',
        });
      if (res.status === 201) {
        tempDeleteUserId = res.body.userId as string;
      }
    });

    it('TC-U36 — admin deletes a user', async () => {
      expect(tempDeleteUserId).toBeTruthy();

      const res = await auth(f.users.admin.token).delete(
        `/api/admin/users/${tempDeleteUserId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, message: 'User deleted successfully' });

      // Verify gone from Firestore
      const check = await auth(f.users.admin.token).get(`/api/users/${tempDeleteUserId}`);
      expect(check.status).toBe(404);

      tempDeleteUserId = ''; // already deleted — skip afterAll cleanup
    });

    it('TC-U37 — admin cannot delete self', async () => {
      const res = await auth(f.users.admin.token).delete(
        `/api/admin/users/${f.users.admin.uid}`,
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/cannot delete yourself/i);
    });

    it('TC-U38 — admin cannot delete trainer with managed groups', async () => {
      // trainer_star manages mdrt_star
      const res = await auth(f.users.admin.token).delete(
        `/api/admin/users/${f.users.trainer_star.uid}`,
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reassign groups first/i);
    });

    it('TC-U39 — non-admin gets 403', async () => {
      const res = await auth(f.users.agent_star_1.token).delete(
        `/api/admin/users/${f.users.agent_power_2.uid}`,
      );
      expect(res.status).toBe(403);
    });

    it('TC-U40 — non-existent user returns 404', async () => {
      const res = await auth(f.users.admin.token).delete(
        '/api/admin/users/doesnotexist',
      );
      expect(res.status).toBe(404);
    });
  });
});
