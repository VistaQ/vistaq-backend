/**
 * Auth API — Integration Tests
 *
 * Covers TC-A01 through TC-A19:
 *   POST /api/auth/register
 *   POST /api/auth/login
 *   POST /api/admin/users
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

describe('Auth API', () => {
  let f: Fixtures;

  // UIDs of users created during tests — cleaned up in afterAll
  const createdUserIds: string[] = [];

  // UID of the user registered via TC-A01 (also used by TC-A02 and TC-A03)
  let registeredUserId = '';

  // UID of the inactive user created for TC-A12
  let inactiveUserId = '';

  // UIDs created in the admin creation block (TC-A13 / TC-A14)
  let adminCreatedAgentId = '';
  let adminCreatedTrainerId = '';

  beforeAll(async () => {
    f = await getFixtures();

    // Create a throwaway user that we will set inactive for TC-A12.
    // We do this via the admin API so we have a valid UID to manipulate.
    const res = await auth(f.users.admin.token)
      .post('/api/admin/users')
      .send({
        email: 'auth_test_inactive@vistaq.test',
        password: 'TestPass123!',
        name: 'Auth Test Inactive',
        role: 'agent',
        agentCode: 'AUTH_INACTIVE_01',
      });

    if (res.status === 201) {
      inactiveUserId = res.body.userId as string;
      createdUserIds.push(inactiveUserId);

      // Mark the user inactive in Firestore so TC-A12 can test the login block
      const { default: adminPkg } = await import('firebase-admin');
      await adminPkg.firestore().collection('users').doc(inactiveUserId).update({
        status: 'inactive',
      });
    }
  });

  afterAll(async () => {
    const { default: adminPkg } = await import('firebase-admin');
    const db = adminPkg.firestore();

    // Delete all Firestore user docs created during the suite
    await Promise.all(
      createdUserIds.map(async (uid) => {
        try {
          await db.collection('users').doc(uid).delete();
        } catch {
          // Already gone — no-op
        }
        try {
          await adminPkg.auth().deleteUser(uid);
        } catch {
          // Already gone — no-op
        }
      }),
    );

    // TC-A01 also adds the user to a group's memberIds — remove them
    if (registeredUserId) {
      try {
        await db
          .collection('groups')
          .doc(f.groups.mdrt_star.id)
          .update({
            memberIds: adminPkg.firestore.FieldValue.arrayRemove(registeredUserId),
            memberCount: adminPkg.firestore.FieldValue.increment(-1),
          });
      } catch {
        // Group update failed — best effort
      }
    }
  });

  // ==========================================================================
  // POST /api/auth/register
  // ==========================================================================

  describe('POST /auth/register', () => {
    it('TC-A01 — valid registration returns 201 with token and user object', async () => {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Auth Test Agent',
        agentCode: 'AUTH_TEST_001',
        email: 'auth_test_register@vistaq.test',
        password: 'TestPass123!',
        groupId: f.groups.mdrt_star.id,
        acknowledged: true,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('auth_test_register@vistaq.test');
      expect(res.body.user.role).toBe('agent');
      expect(res.body.user.agentCode).toBe('AUTH_TEST_001');
      expect(res.body.user.groupId).toBe(f.groups.mdrt_star.id);
      expect(typeof res.body.user.uid).toBe('string');

      // Track for cleanup
      registeredUserId = res.body.user.uid as string;
      createdUserIds.push(registeredUserId);
    });

    it('TC-A02 — duplicate email returns 409', async () => {
      // Depends on TC-A01 having created the user first
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Auth Test Agent',
        agentCode: 'AUTH_TEST_002',
        email: 'auth_test_register@vistaq.test',
        password: 'TestPass123!',
        groupId: f.groups.mdrt_star.id,
        acknowledged: true,
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already registered');
    });

    it('TC-A03 — duplicate agentCode returns 400', async () => {
      // Depends on TC-A01 having created the user first
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Other Agent',
        agentCode: 'AUTH_TEST_001',
        email: 'auth_test_other@vistaq.test',
        password: 'TestPass123!',
        groupId: f.groups.mdrt_star.id,
        acknowledged: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Agent code already exists');
    });

    it('TC-A04 — missing required field (email) returns 400', async () => {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Jane',
        agentCode: 'AUTH_TEST_003',
        password: 'TestPass123!',
        groupId: f.groups.mdrt_star.id,
        acknowledged: true,
      });

      expect(res.status).toBe(400);
    });

    it('TC-A05 — acknowledged = false returns 400', async () => {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Jane',
        agentCode: 'AUTH_TEST_004',
        email: 'auth_test_ack@vistaq.test',
        password: 'TestPass123!',
        groupId: f.groups.mdrt_star.id,
        acknowledged: false,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('You must acknowledge the privacy policy');
    });

    it('TC-A06 — password too short returns 400', async () => {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Jane',
        agentCode: 'AUTH_TEST_005',
        email: 'auth_test_short_pw@vistaq.test',
        password: '123',
        groupId: f.groups.mdrt_star.id,
        acknowledged: true,
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Password must be at least 6 characters');
    });

    it('TC-A07 — non-existent groupId returns 404', async () => {
      const res = await request(app).post('/api/auth/register').send({
        fullName: 'Jane',
        agentCode: 'AUTH_TEST_006',
        email: 'auth_test_nogroup@vistaq.test',
        password: 'TestPass123!',
        groupId: 'nonexistent_group_id',
        acknowledged: true,
      });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Group not found');
    });
  });

  // ==========================================================================
  // POST /api/auth/login
  // ==========================================================================

  describe('POST /auth/login', () => {
    it('TC-A08 — valid credentials returns 200 with token and user', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: f.users.admin.email,
        password: f.password,
      });

      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toBeDefined();
      expect(res.body.user.uid).toBe(f.users.admin.uid);
      expect(res.body.user.role).toBe('admin');
    });

    it('TC-A09 — wrong password returns 401', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: f.users.admin.email,
        password: 'WrongPassword999!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('TC-A10 — unknown email returns 401', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nobody_auth_test@vistaq.test',
        password: 'TestPass123!',
      });

      expect(res.status).toBe(401);
    });

    it('TC-A11 — missing email returns 400', async () => {
      const res = await request(app).post('/api/auth/login').send({
        password: 'TestPass123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and password are required');
    });

    it('TC-A12 — inactive user returns 403', async () => {
      expect(inactiveUserId).toBeTruthy();

      const res = await request(app).post('/api/auth/login').send({
        email: 'auth_test_inactive@vistaq.test',
        password: 'TestPass123!',
      });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('User account is not active');
    });
  });

  // ==========================================================================
  // POST /api/admin/users
  // ==========================================================================

  describe('POST /admin/users', () => {
    it('TC-A13 — admin creates an agent → 201 with agentCode in response', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_new_agent@vistaq.test',
          password: 'TestPass123!',
          name: 'Auth Test New Agent',
          role: 'agent',
          agentCode: 'AUTH_AGENT_100',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.userId).toBe('string');
      expect(res.body.agentCode).toBe('AUTH_AGENT_100');
      expect(res.body.message).toBe('User created successfully');

      adminCreatedAgentId = res.body.userId as string;
      createdUserIds.push(adminCreatedAgentId);
    });

    it('TC-A14 — admin creates a trainer → 201, no agentCode in response', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_new_trainer@vistaq.test',
          password: 'TestPass123!',
          name: 'Auth Test New Trainer',
          role: 'trainer',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.userId).toBe('string');
      expect(res.body.agentCode).toBeUndefined();

      adminCreatedTrainerId = res.body.userId as string;
      createdUserIds.push(adminCreatedTrainerId);
    });

    it('TC-A15 — non-admin (agent token) attempt returns 403', async () => {
      const res = await auth(f.users.agent_star_1.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_forbidden@vistaq.test',
          password: 'TestPass123!',
          name: 'Should Fail',
          role: 'agent',
          agentCode: 'AUTH_FORBIDDEN_01',
        });

      expect(res.status).toBe(403);
    });

    it('TC-A16 — missing required field (role) returns 400', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_norole@vistaq.test',
          password: 'TestPass123!',
          name: 'No Role User',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email, password, name, and role are required');
    });

    it('TC-A17 — agent role without agentCode returns 400', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_no_agent_code@vistaq.test',
          password: 'TestPass123!',
          name: 'No Agent Code',
          role: 'agent',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Agents and group leaders must have an agent code');
    });

    it('TC-A18 — invalid role value returns 400', async () => {
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_bad_role@vistaq.test',
          password: 'TestPass123!',
          name: 'Bad Role User',
          role: 'superuser',
        });

      expect(res.status).toBe(400);
    });

    it('TC-A19 — duplicate email returns 409', async () => {
      // Depends on TC-A13 having created auth_test_new_agent@vistaq.test
      const res = await auth(f.users.admin.token)
        .post('/api/admin/users')
        .send({
          email: 'auth_test_new_agent@vistaq.test',
          password: 'TestPass123!',
          name: 'Duplicate Email',
          role: 'trainer',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Email already exists');
    });
  });
});
