/**
 * Bootstrap Script
 *
 * Populates the local Supabase DB with realistic fixture data after a db reset.
 * Uses @faker-js/faker for names, emails, and locations.
 *
 * Run after: npx supabase db reset
 * Usage:     node scripts/bootstrap.js
 *
 * Output: scripts/seed-manifest.json
 *   — contains all credentials and IDs needed by integration tests
 *
 * Layout:
 *   1 admin
 *   2 master trainers
 *   3 groups (MDRT Stars, KPI Busters, MDRT Power Rangers)
 *     each with: 1 trainer, 1 group_leader (AG006-AG008), 1 agent (AG009-AG011)
 *
 * Agent code allocation:
 *   AG001-AG005 — reserved for integration tests (must stay unused)
 *   AG006-AG008 — group leaders (bootstrap)
 *   AG009-AG011 — agents (bootstrap)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const TENANT_SLUG = 'demo-agency';
const PASSWORD    = 'Password1!';  // all non-admin users
const ADMIN_PASSWORD = 'password'; // admin only

const ADMIN_EMAIL = 'admin@demo-agency.com';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Group definitions (fixed names, IDs generated at runtime)
// ---------------------------------------------------------------------------

const GROUP_DEFS = [
  { key: 'mdrt_stars',    name: 'MDRT Stars',         leaderCode: 'AG006', agentCode: 'AG009' },
  { key: 'kpi_busters',   name: 'KPI Busters',         leaderCode: 'AG007', agentCode: 'AG010' },
  { key: 'power_rangers', name: 'MDRT Power Rangers',  leaderCode: 'AG008', agentCode: 'AG011' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createAuthUser(email, password) {
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Already exists — find and return existing
    if (error.status === 422 || error.message?.includes('already been registered')) {
      const { data: list } = await client.auth.admin.listUsers({ perPage: 1000 });
      const existing = list?.users?.find((u) => u.email === email);
      if (existing) return { uid: existing.id, created: false };
    }
    throw new Error(`Auth createUser failed for ${email}: ${error.message}`);
  }

  return { uid: data.user.id, created: true };
}

async function insertUser(id, { email, name, role, agentCode = null, groupId = null, location = null }) {
  const { error } = await client.from('users').insert({
    id,
    tenant_id: TENANT_ID,
    email,
    name,
    role,
    status: 'active',
    ...(agentCode ? { agent_code: agentCode } : {}),
    ...(groupId   ? { group_id: groupId }     : {}),
    ...(location  ? { location }               : {}),
  });

  if (error && error.code !== '23505') {
    throw new Error(`Failed to insert user row for ${email}: ${error.message}`);
  }

  return error?.code === '23505' ? 'exists' : 'created';
}

function log(status, role, email, extra = '') {
  const icon = status === 'created' ? '✅' : '⏭ ';
  console.log(`  ${icon} ${role.padEnd(14)} ${email}${extra ? `  ${extra}` : ''}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function bootstrap() {
  const manifest = {
    tenantId:      TENANT_ID,
    tenantSlug:    TENANT_SLUG,
    adminPassword: ADMIN_PASSWORD,
    password:      PASSWORD,
    users:         {},
    groups:        {},
  };

  // ── Step 1: Admin ──────────────────────────────────────────────────────────

  console.log('\n── Step 1: Admin ──');

  const { uid: adminId, created: adminCreated } = await createAuthUser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminStatus = await insertUser(adminId, {
    email: ADMIN_EMAIL,
    name: faker.person.fullName(),
    role: 'admin',
  });

  log(adminCreated ? 'created' : adminStatus, 'admin', ADMIN_EMAIL, `(${adminId})`);

  manifest.users.admin = { id: adminId, email: ADMIN_EMAIL, role: 'admin' };

  // ── Step 2: Master Trainers ────────────────────────────────────────────────

  console.log('\n── Step 2: Master Trainers ──');

  for (let i = 1; i <= 2; i++) {
    const email = faker.internet.email({ provider: 'vistaq.test' }).toLowerCase();
    const name  = faker.person.fullName();
    const { uid, created } = await createAuthUser(email, PASSWORD);
    const status = await insertUser(uid, { email, name, role: 'master_trainer' });

    log(created ? 'created' : status, 'master_trainer', email);
    manifest.users[`masterTrainer${i}`] = { id: uid, email, name, role: 'master_trainer' };
  }

  // ── Step 3: Groups + members ───────────────────────────────────────────────

  console.log('\n── Step 3: Groups ──');

  for (const gDef of GROUP_DEFS) {
    // Create group
    const { data: groupData, error: groupErr } = await client
      .from('groups')
      .insert({ tenant_id: TENANT_ID, name: gDef.name, status: 'active' })
      .select('id')
      .single();

    if (groupErr && groupErr.code !== '23505') {
      throw new Error(`Failed to create group "${gDef.name}": ${groupErr.message}`);
    }

    // If already exists, look it up
    let groupId = groupData?.id;
    if (!groupId) {
      const { data: existing } = await client
        .from('groups')
        .select('id')
        .eq('name', gDef.name)
        .eq('tenant_id', TENANT_ID)
        .single();
      groupId = existing?.id;
    }

    console.log(`\n  Group: "${gDef.name}" (${groupId})`);

    manifest.groups[gDef.key] = { id: groupId, name: gDef.name };

    // Trainer
    const trainerEmail = faker.internet.email({ provider: 'vistaq.test' }).toLowerCase();
    const trainerName  = faker.person.fullName();
    const { uid: trainerId, created: trainerCreated } = await createAuthUser(trainerEmail, PASSWORD);
    const trainerStatus = await insertUser(trainerId, { email: trainerEmail, name: trainerName, role: 'trainer' });

    log(trainerCreated ? 'created' : trainerStatus, 'trainer', trainerEmail);
    manifest.users[`${gDef.key}_trainer`] = { id: trainerId, email: trainerEmail, name: trainerName, role: 'trainer' };

    // Wire group_trainer
    const { error: gtErr } = await client
      .from('group_trainers')
      .insert({ group_id: groupId, trainer_id: trainerId });

    if (gtErr && gtErr.code !== '23505') {
      throw new Error(`Failed to insert group_trainer: ${gtErr.message}`);
    }

    // Group Leader
    const leaderEmail    = faker.internet.email({ provider: 'vistaq.test' }).toLowerCase();
    const leaderName     = faker.person.fullName();
    const leaderLocation = faker.location.city();
    const { uid: leaderId, created: leaderCreated } = await createAuthUser(leaderEmail, PASSWORD);
    const leaderStatus = await insertUser(leaderId, {
      email: leaderEmail,
      name: leaderName,
      role: 'group_leader',
      agentCode: gDef.leaderCode,
      groupId,
      location: leaderLocation,
    });

    log(leaderCreated ? 'created' : leaderStatus, 'group_leader', leaderEmail, `(${gDef.leaderCode})`);
    manifest.users[`${gDef.key}_leader`] = {
      id: leaderId, email: leaderEmail, name: leaderName,
      role: 'group_leader', agentCode: gDef.leaderCode, groupId,
    };

    // Update group leader_id
    await client.from('groups').update({ leader_id: leaderId }).eq('id', groupId);

    // Mark leader agent code as used
    await client
      .from('agent_codes')
      .update({ user_id: leaderId, is_used: true })
      .eq('agent_code', gDef.leaderCode);

    // Agent
    const agentEmail    = faker.internet.email({ provider: 'vistaq.test' }).toLowerCase();
    const agentName     = faker.person.fullName();
    const agentLocation = faker.location.city();
    const { uid: agentId, created: agentCreated } = await createAuthUser(agentEmail, PASSWORD);
    const agentStatus = await insertUser(agentId, {
      email: agentEmail,
      name: agentName,
      role: 'agent',
      agentCode: gDef.agentCode,
      groupId,
      location: agentLocation,
    });

    log(agentCreated ? 'created' : agentStatus, 'agent', agentEmail, `(${gDef.agentCode})`);
    manifest.users[`${gDef.key}_agent`] = {
      id: agentId, email: agentEmail, name: agentName,
      role: 'agent', agentCode: gDef.agentCode, groupId,
    };

    // Mark agent agent code as used
    await client
      .from('agent_codes')
      .update({ user_id: agentId, is_used: true })
      .eq('agent_code', gDef.agentCode);
  }

  // ── Step 4: Write manifest ─────────────────────────────────────────────────

  console.log('\n── Step 4: Writing manifest ──');

  const manifestPath = path.join(__dirname, 'seed-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ✅ Written to ${manifestPath}`);

  // ── Summary ────────────────────────────────────────────────────────────────

  const userCount = Object.keys(manifest.users).length;
  const groupCount = Object.keys(manifest.groups).length;

  console.log('\n── Summary ──');
  console.log(`  Admin    : ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`  Password : ${PASSWORD} (all other users)`);
  console.log(`  Users    : ${userCount}`);
  console.log(`  Groups   : ${groupCount}`);
  console.log('\n✅ Bootstrap complete.');
  console.log('   Credentials saved to scripts/seed-manifest.json\n');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

bootstrap().catch((err) => {
  console.error('\n❌ Bootstrap failed:', err);
  process.exit(1);
});
