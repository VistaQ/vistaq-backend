/**
 * Test Data Seed Script
 *
 * Creates Firebase Auth accounts + Firestore documents for all test fixtures.
 * Idempotent — skips users/groups that already exist.
 *
 * Usage:
 *   node scripts/seed-test-data.js
 *
 * Output:
 *   scripts/seed-manifest.json  — UIDs, group IDs, and login credentials
 *                                  for use in tests.
 *
 * Seeded layout:
 *   Global  : 1 admin, 1 master_trainer
 *   Full    : MDRT Star    — 1 trainer, 1 group_leader, 2 agents
 *   Full    : Sales Power  — 1 trainer, 1 group_leader, 2 agents
 *   Light   : MDRT Legend  — 1 trainer, 1 group_leader, 1 agent
 *   Light   : Agent Avengers — 1 trainer, 1 group_leader, 1 agent
 *   Light   : KPI Busters  — 1 trainer, 1 group_leader, 1 agent
 *   Total   : 19 users, 5 groups
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const serviceAccount = require('../config/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();
const auth = admin.auth();
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const TEST_PASSWORD = 'TestPass123!';

// ---------------------------------------------------------------------------
// User definitions
// ---------------------------------------------------------------------------

/**
 * Each entry describes one test user.
 *
 * Fields:
 *   key          — stable identifier used in the manifest and group refs
 *   email        — Firebase Auth email
 *   name         — display name
 *   role         — Firestore role field
 *   agentCode    — required for agent / group_leader roles
 *   groupKey     — which group this user belongs to (resolved after group creation)
 */
const USER_DEFS = [
  // ── Global ──────────────────────────────────────────────────────────────
  {
    key: 'admin',
    email: 'test.admin@vistaq.test',
    name: 'Test Admin',
    role: 'admin',
  },
  {
    key: 'master_trainer',
    email: 'test.master@vistaq.test',
    name: 'Test Master Trainer',
    role: 'master_trainer',
  },

  // ── MDRT Star (fully seeded) ─────────────────────────────────────────────
  {
    key: 'trainer_star',
    email: 'test.trainer.star@vistaq.test',
    name: 'Star Trainer',
    role: 'trainer',
  },
  {
    key: 'leader_star',
    email: 'test.leader.star@vistaq.test',
    name: 'Star Leader',
    role: 'group_leader',
    agentCode: 'LS001',
    groupKey: 'mdrt_star',
  },
  {
    key: 'agent_star_1',
    email: 'test.agent.star1@vistaq.test',
    name: 'Star Agent One',
    role: 'agent',
    agentCode: 'AS001',
    groupKey: 'mdrt_star',
  },
  {
    key: 'agent_star_2',
    email: 'test.agent.star2@vistaq.test',
    name: 'Star Agent Two',
    role: 'agent',
    agentCode: 'AS002',
    groupKey: 'mdrt_star',
  },

  // ── Sales Power (fully seeded) ───────────────────────────────────────────
  {
    key: 'trainer_power',
    email: 'test.trainer.power@vistaq.test',
    name: 'Power Trainer',
    role: 'trainer',
  },
  {
    key: 'leader_power',
    email: 'test.leader.power@vistaq.test',
    name: 'Power Leader',
    role: 'group_leader',
    agentCode: 'LP001',
    groupKey: 'sales_power',
  },
  {
    key: 'agent_power_1',
    email: 'test.agent.power1@vistaq.test',
    name: 'Power Agent One',
    role: 'agent',
    agentCode: 'AP001',
    groupKey: 'sales_power',
  },
  {
    key: 'agent_power_2',
    email: 'test.agent.power2@vistaq.test',
    name: 'Power Agent Two',
    role: 'agent',
    agentCode: 'AP002',
    groupKey: 'sales_power',
  },

  // ── MDRT Legend (lightly seeded) ─────────────────────────────────────────
  {
    key: 'trainer_legend',
    email: 'test.trainer.legend@vistaq.test',
    name: 'Legend Trainer',
    role: 'trainer',
  },
  {
    key: 'leader_legend',
    email: 'test.leader.legend@vistaq.test',
    name: 'Legend Leader',
    role: 'group_leader',
    agentCode: 'LL001',
    groupKey: 'mdrt_legend',
  },
  {
    key: 'agent_legend',
    email: 'test.agent.legend@vistaq.test',
    name: 'Legend Agent',
    role: 'agent',
    agentCode: 'AL001',
    groupKey: 'mdrt_legend',
  },

  // ── Agent Avengers (lightly seeded) ──────────────────────────────────────
  {
    key: 'trainer_avengers',
    email: 'test.trainer.avengers@vistaq.test',
    name: 'Avengers Trainer',
    role: 'trainer',
  },
  {
    key: 'leader_avengers',
    email: 'test.leader.avengers@vistaq.test',
    name: 'Avengers Leader',
    role: 'group_leader',
    agentCode: 'LA001',
    groupKey: 'agent_avengers',
  },
  {
    key: 'agent_avengers',
    email: 'test.agent.avengers@vistaq.test',
    name: 'Avengers Agent',
    role: 'agent',
    agentCode: 'AA001',
    groupKey: 'agent_avengers',
  },

  // ── KPI Busters (lightly seeded) ─────────────────────────────────────────
  {
    key: 'trainer_busters',
    email: 'test.trainer.busters@vistaq.test',
    name: 'Busters Trainer',
    role: 'trainer',
  },
  {
    key: 'leader_busters',
    email: 'test.leader.busters@vistaq.test',
    name: 'Busters Leader',
    role: 'group_leader',
    agentCode: 'LB001',
    groupKey: 'kpi_busters',
  },
  {
    key: 'agent_busters',
    email: 'test.agent.busters@vistaq.test',
    name: 'Busters Agent',
    role: 'agent',
    agentCode: 'KB001',
    groupKey: 'kpi_busters',
  },
];

// ---------------------------------------------------------------------------
// Group definitions
// ---------------------------------------------------------------------------

/**
 * Each entry describes one test group.
 *
 * Fields:
 *   key          — stable identifier used in USER_DEFS.groupKey
 *   name         — Firestore group name (must match the real group names)
 *   trainerKey   — USER_DEFS.key of the trainer who manages this group
 *   leaderKey    — USER_DEFS.key of the group_leader
 *   memberKeys   — USER_DEFS.keys of all members (must include leaderKey)
 */
const GROUP_DEFS = [
  {
    key: 'mdrt_star',
    name: 'MDRT Star',
    trainerKey: 'trainer_star',
    leaderKey: 'leader_star',
    memberKeys: ['leader_star', 'agent_star_1', 'agent_star_2'],
  },
  {
    key: 'sales_power',
    name: 'Sales Power',
    trainerKey: 'trainer_power',
    leaderKey: 'leader_power',
    memberKeys: ['leader_power', 'agent_power_1', 'agent_power_2'],
  },
  {
    key: 'mdrt_legend',
    name: 'MDRT Legend',
    trainerKey: 'trainer_legend',
    leaderKey: 'leader_legend',
    memberKeys: ['leader_legend', 'agent_legend'],
  },
  {
    key: 'agent_avengers',
    name: 'Agent Avengers',
    trainerKey: 'trainer_avengers',
    leaderKey: 'leader_avengers',
    memberKeys: ['leader_avengers', 'agent_avengers'],
  },
  {
    key: 'kpi_busters',
    name: 'KPI Busters',
    trainerKey: 'trainer_busters',
    leaderKey: 'leader_busters',
    memberKeys: ['leader_busters', 'agent_busters'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function permissionsForRole(role) {
  switch (role) {
    case 'admin':         return ['*'];
    case 'master_trainer':
    case 'trainer':       return ['view_managed_groups', 'view_managed_sales', 'view_managed_users'];
    case 'group_leader':  return ['view_own_group', 'view_team_sales', 'create_sales', 'view_own_sales'];
    case 'agent':         return ['create_sales', 'view_own_sales'];
    default:              return [];
  }
}

function isMemberRole(role) {
  return role === 'agent' || role === 'group_leader';
}

function isTrainerRole(role) {
  return role === 'trainer' || role === 'master_trainer';
}

/**
 * Create a Firebase Auth user; return the existing UID if the email is taken.
 */
async function createAuthUser(email, name) {
  try {
    const record = await auth.createUser({
      email,
      password: TEST_PASSWORD,
      displayName: name,
      emailVerified: true,
      disabled: false,
    });
    return { uid: record.uid, created: true };
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(email);
      return { uid: existing.uid, created: false };
    }
    throw err;
  }
}

/**
 * Find a group document by its name field.
 * Returns { id, data } or null.
 */
async function findGroupByName(name) {
  const snap = await db
    .collection('groups')
    .where('name', '==', name)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, data: snap.docs[0].data() };
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log('Starting seed...\n');

  // ── Step 1: Create all Firebase Auth accounts ────────────────────────────

  console.log('── Step 1: Creating Auth accounts ──');

  const uidMap = {}; // key → uid

  for (const def of USER_DEFS) {
    const { uid, created } = await createAuthUser(def.email, def.name);
    uidMap[def.key] = uid;

    if (created) {
      console.log(`  ✅ Created  ${def.role.padEnd(14)} ${def.email}`);
    } else {
      console.log(`  ⏭  Exists   ${def.role.padEnd(14)} ${def.email} (${uid})`);
    }
  }

  console.log();

  // ── Step 2: Create Firestore user documents ──────────────────────────────

  console.log('── Step 2: Writing user documents ──');

  for (const def of USER_DEFS) {
    const uid = uidMap[def.key];
    const ref = db.collection('users').doc(uid);
    const existing = await ref.get();

    if (existing.exists) {
      console.log(`  ⏭  Exists   ${def.email}`);
      continue;
    }

    const userData = {
      email: def.email,
      name: def.name,
      phone: '',
      location: '',
      agency: 'VistAQ Test',
      role: def.role,
      permissions: permissionsForRole(def.role),
      groupId: null,
      groupName: null,
      agentCode: isMemberRole(def.role) ? def.agentCode : null,
      managedGroupIds: isTrainerRole(def.role) ? [] : null,
      totalProspects: 0,
      totalAppointments: 0,
      totalSales: 0,
      totalACE: 0,
      totalPoints: 0,
      currentBadge: isMemberRole(def.role) ? 'Rookie' : null,
      currentBadgeColor: isMemberRole(def.role) ? 'gray' : null,
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await ref.set(userData);
    console.log(`  ✅ Written  ${def.email}`);
  }

  console.log();

  // ── Step 3: Create or find groups, wire up members ───────────────────────

  console.log('── Step 3: Creating groups ──');

  const groupIdMap = {}; // groupKey → Firestore document ID

  for (const gDef of GROUP_DEFS) {
    // Find existing group by name
    const existing = await findGroupByName(gDef.name);

    if (existing) {
      groupIdMap[gDef.key] = existing.id;
      console.log(`  ⏭  Exists   "${gDef.name}" (${existing.id})`);
      continue;
    }

    // Resolve UIDs
    const trainerUid  = uidMap[gDef.trainerKey];
    const leaderUid   = uidMap[gDef.leaderKey];
    const memberUids  = gDef.memberKeys.map((k) => uidMap[k]);

    const trainerDoc  = await db.collection('users').doc(trainerUid).get();
    const leaderDoc   = await db.collection('users').doc(leaderUid).get();

    const groupData = {
      name: gDef.name,

      leaderId:    leaderUid,
      leaderName:  leaderDoc.data().name,
      leaderEmail: leaderDoc.data().email,

      trainerIds:   [trainerUid],
      trainerNames: [trainerDoc.data().name],

      memberIds:    memberUids,
      memberCount:  memberUids.length,

      totalProspects:    0,
      totalAppointments: 0,
      totalSales:        0,
      totalACE:          0,
      totalPoints:       0,

      status: 'active',

      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const ref = await db.collection('groups').add(groupData);
    groupIdMap[gDef.key] = ref.id;
    console.log(`  ✅ Created  "${gDef.name}" (${ref.id})`);
  }

  console.log();

  // ── Step 4: Update user documents with group info ────────────────────────

  console.log('── Step 4: Linking users to groups ──');

  const batch = db.batch();

  for (const gDef of GROUP_DEFS) {
    const groupId   = groupIdMap[gDef.key];
    const groupName = gDef.name;

    // Assign groupId/groupName to all members
    for (const memberKey of gDef.memberKeys) {
      const uid = uidMap[memberKey];
      const ref = db.collection('users').doc(uid);
      batch.update(ref, { groupId, groupName, updatedAt: Timestamp.now() });
    }

    // Assign managedGroupIds to the trainer
    const trainerRef = db.collection('users').doc(uidMap[gDef.trainerKey]);
    batch.update(trainerRef, {
      managedGroupIds: FieldValue.arrayUnion(groupId),
      updatedAt: Timestamp.now(),
    });
  }

  await batch.commit();
  console.log('  ✅ Done\n');

  // ── Step 5: Write manifest ────────────────────────────────────────────────

  console.log('── Step 5: Writing manifest ──');

  const manifest = {
    password: TEST_PASSWORD,
    users: {},
    groups: {},
  };

  for (const def of USER_DEFS) {
    manifest.users[def.key] = {
      uid:       uidMap[def.key],
      email:     def.email,
      role:      def.role,
      agentCode: def.agentCode || null,
      groupKey:  def.groupKey  || null,
    };
  }

  for (const gDef of GROUP_DEFS) {
    manifest.groups[gDef.key] = {
      id:         groupIdMap[gDef.key],
      name:       gDef.name,
      trainerKey: gDef.trainerKey,
      leaderKey:  gDef.leaderKey,
      memberKeys: gDef.memberKeys,
    };
  }

  const manifestPath = path.join(__dirname, 'seed-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ✅ Written to ${manifestPath}\n`);

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log('── Summary ──');
  console.log(`  Users  : ${USER_DEFS.length}`);
  console.log(`  Groups : ${GROUP_DEFS.length}`);
  console.log(`  Pass   : ${TEST_PASSWORD}`);
  console.log('\nSeed complete.');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  });
