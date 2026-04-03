/**
 * seed-sentry-metrics.ts
 *
 * Hits every API endpoint to populate Sentry with metric data so that
 * dashboard widget attribute dropdowns (route, tenant_id, status_class, etc.)
 * become available in the Sentry UI.
 *
 * Usage:
 *   npx tsx scripts/seed-sentry-metrics.ts
 *   BASE_URL=https://staging.example.com npx tsx scripts/seed-sentry-metrics.ts
 *
 * Optional — to also seed the business.registration metric:
 *   REGISTRATION_AGENT_CODE=AG012 npx tsx scripts/seed-sentry-metrics.ts
 *
 *   IMPORTANT: Registration permanently consumes an agent code. Do NOT use
 *   AG001-AG005 (reserved for integration tests) or AG006-AG011 (already used
 *   by seeded users). Provide a fresh unused code that exists in the database.
 *   The registered user will be deleted automatically after the metric is emitted.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000';
const REGISTRATION_AGENT_CODE = 'AG012';// process.env.REGISTRATION_AGENT_CODE ?? null;

const manifest = JSON.parse(
  readFileSync(join(__dirname, 'seed-manifest.json'), 'utf-8'),
) as {
  tenantSlug: string;
  adminPassword: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
  groups: Record<string, { id: string; name: string }>;
};

const TENANT_SLUG = manifest.tenantSlug;
const ADMIN = manifest.users.admin;
const TRAINER = manifest.users.mdrt_stars_trainer;
const AGENT = manifest.users.mdrt_stars_agent;
const GROUP = manifest.groups.mdrt_stars;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

let passCount = 0;
let failCount = 0;

async function req(
  label: string,
  method: string,
  path: string,
  options: {
    token?: string;
    tenantSlug?: string;
    body?: unknown;
    expectStatus?: number | number[];
  } = {},
): Promise<{ status: number; body: unknown }> {
  const { token, tenantSlug, body, expectStatus = 200 } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantSlug) headers['X-Tenant-Slug'] = tenantSlug;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  const expected = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
  const ok = expected.includes(res.status);

  const icon = ok ? '✓' : '✗';
  const statusNote = ok ? '' : ` (expected ${expected.join('/')})`;

  console.log(`  ${icon} [${res.status}${statusNote}] ${method} ${path}  — ${label}`);

  if (ok) passCount++; else failCount++;

  return { status: res.status, body: json };
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': TENANT_SLUG },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json().catch(() => null)) as { data?: { token?: string } } | null;
  return json?.data?.token ?? null;
}

// ---------------------------------------------------------------------------
// Future ISO date helpers
// ---------------------------------------------------------------------------

function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\n🚀  Seeding Sentry metrics against ${BASE_URL}\n`);

  // -------------------------------------------------------------------------
  // 1. Authentication — generates business.login metrics
  // -------------------------------------------------------------------------
  console.log('── Auth ──────────────────────────────────────────');

  const adminToken = await login(ADMIN.email, manifest.adminPassword);
  if (!adminToken) throw new Error(`Admin login failed for ${ADMIN.email}`);
  console.log(`  ✓ Logged in as admin (${ADMIN.email})`);

  const trainerToken = await login(TRAINER.email, manifest.password);
  if (!trainerToken) throw new Error(`Trainer login failed for ${TRAINER.email}`);
  console.log(`  ✓ Logged in as trainer (${TRAINER.email})`);

  const agentToken = await login(AGENT.email, manifest.password);
  if (!agentToken) throw new Error(`Agent login failed for ${AGENT.email}`);
  console.log(`  ✓ Logged in as agent (${AGENT.email})`);

  // Optional registration — populates business.registration metric
  // Skipped unless REGISTRATION_AGENT_CODE env var is provided (see file header)
  if (REGISTRATION_AGENT_CODE) {
    const TEMP_EMAIL = `sentry-seed-temp-${Date.now()}@vistaq.test`;
    const registerRes = await req(
      `register temp user (agent code: ${REGISTRATION_AGENT_CODE}) → business.registration metric`,
      'POST',
      '/api/auth/register',
      {
        tenantSlug: TENANT_SLUG,
        body: {
          fullName: 'Sentry Seed Temp User',
          agentCode: REGISTRATION_AGENT_CODE,
          email: TEMP_EMAIL,
          password: 'TempPass1!',
          groupId: GROUP.id,
          location: 'KL',
        },
        expectStatus: 201,
      },
    );
    const tempUserId = (registerRes.body as { data?: { user?: { id?: string } } })?.data?.user?.id;
    if (tempUserId) {
      await req('delete temp registered user (cleanup)', 'DELETE', `/api/users/${tempUserId}`, {
        token: adminToken,
      });
    }
  } else {
    console.log('  ⚠  REGISTRATION_AGENT_CODE not set — skipping business.registration metric');
    console.log('     Provide an unused agent code via env var to seed this metric.');
  }

  // Deliberate failure — populates business.login{outcome:failure} and http.error.count
  await req('login failure → business.login failure metric', 'POST', '/api/auth/login', {
    tenantSlug: TENANT_SLUG,
    body: { email: ADMIN.email, password: 'wrong-password' },
    expectStatus: [400, 401],
  });

  // -------------------------------------------------------------------------
  // 2. Read-only endpoints (admin token) — generates http.* and db.* metrics
  // -------------------------------------------------------------------------
  console.log('\n── Read endpoints ────────────────────────────────');

  await req('health check', 'GET', '/health');
  await req('public groups', 'GET', '/api/public/groups', { tenantSlug: TENANT_SLUG });
  await req('auth me', 'GET', '/api/auth/me', { token: adminToken });
  await req('list users', 'GET', '/api/users', { token: adminToken });
  await req('get user by id', 'GET', `/api/users/${ADMIN.id}`, { token: adminToken });
  await req('get user 404 → error metrics', 'GET', '/api/users/00000000-0000-0000-0000-000000000000', {
    token: adminToken,
    expectStatus: 404,
  });
  await req('list groups', 'GET', '/api/groups', { token: adminToken });
  await req('get group by id', 'GET', `/api/groups/${GROUP.id}`, { token: adminToken });
  await req('groups stats', 'GET', '/api/groups/stats', { token: adminToken });
  await req('group detail stats', 'GET', `/api/groups/${GROUP.id}/stats`, { token: adminToken });
  await req('dashboard stats', 'GET', '/api/dashboard/stats', { token: adminToken });
  await req('point activity types', 'GET', '/api/point-activity-types', { token: adminToken });
  await req('point configs', 'GET', '/api/point-configs', { token: adminToken });
  await req('leaderboard', 'GET', '/api/leaderboard', { token: adminToken });
  await req('leaderboard stats mtd', 'GET', '/api/leaderboard/stats?period=mtd', { token: adminToken });
  await req('leaderboard stats ytd', 'GET', '/api/leaderboard/stats?period=ytd', { token: adminToken });
  await req('agent points', 'GET', `/api/agent-points?userId=${AGENT.id}`, { token: adminToken });

  // -------------------------------------------------------------------------
  // 3. Prospect lifecycle (as agent) — generates stage_transition metrics
  // -------------------------------------------------------------------------
  console.log('\n── Prospect lifecycle ────────────────────────────');

  const createProspectRes = await req('create prospect', 'POST', '/api/prospects', {
    token: agentToken,
    body: { fullName: 'Sentry Seed Prospect', phoneNum: '+60123456789' },
    expectStatus: 201,
  });

  const prospectId = (createProspectRes.body as { data?: { id?: string } })?.data?.id;

  if (prospectId) {
    await req('list prospects', 'GET', '/api/prospects', { token: agentToken });
    await req('get prospect by id', 'GET', `/api/prospects/${prospectId}`, { token: agentToken });

    // Stage transition: prospect → appointment  (emitProspectStageTransition)
    await req('stage transition: prospect → appointment', 'PUT', `/api/prospects/${prospectId}`, {
      token: agentToken,
      body: {
        currentStage: 'appointment',
        appointmentDate: futureDate(3).split('T')[0],
        appointmentStartTime: '10:00',
        appointmentEndTime: '11:00',
        appointmentLocation: 'Office',
        appointmentStatus: 'scheduled',
      },
    });

    // Stage transition: appointment → sales  (second emitProspectStageTransition)
    await req('stage transition: appointment → sales', 'PUT', `/api/prospects/${prospectId}`, {
      token: agentToken,
      body: {
        currentStage: 'sales',
        salesMeetingStages: ['social', 'factFind'],
      },
    });
  } else {
    console.log('  ⚠  prospect ID not found in response — skipping lifecycle steps');
  }

  // -------------------------------------------------------------------------
  // 4. Event lifecycle (as admin) — generates service spans
  // -------------------------------------------------------------------------
  console.log('\n── Event lifecycle ───────────────────────────────');

  const createEventRes = await req('create event', 'POST', '/api/events', {
    token: adminToken,
    body: {
      title: 'Sentry Seed Event',
      type: 'Online',
      description: 'Generated by seed-sentry-metrics script',
      startDate: futureDate(7),
      endDate: futureDate(8),
      status: 'upcoming',
      groupIds: [GROUP.id],
    },
    expectStatus: 201,
  });

  const eventId = (createEventRes.body as { data?: { id?: string } })?.data?.id;

  if (eventId) {
    await req('list events', 'GET', '/api/events', { token: adminToken });
    await req('get event by id', 'GET', `/api/events/${eventId}`, { token: adminToken });
    await req('update event', 'PUT', `/api/events/${eventId}`, {
      token: adminToken,
      body: { title: 'Sentry Seed Event (updated)', status: 'upcoming' },
    });
  } else {
    console.log('  ⚠  event ID not found in response — skipping lifecycle steps');
  }

  // -------------------------------------------------------------------------
  // 5. Coaching session lifecycle — generates session.join metric
  // -------------------------------------------------------------------------
  console.log('\n── Coaching session lifecycle ────────────────────');

  const createSessionRes = await req('create session', 'POST', '/api/coaching-sessions', {
    token: adminToken,
    body: {
      coachingType: 'group_coaching',
      title: 'Sentry Seed Session',
      description: 'Generated by seed-sentry-metrics script',
      startDate: futureDate(5),
      endDate: futureDate(6),
      trainingMode: 'online',
      status: 'upcoming',
      groupIds: [GROUP.id],
    },
    expectStatus: 201,
  });

  const sessionId = (createSessionRes.body as { data?: { id?: string } })?.data?.id;

  if (sessionId) {
    await req('list sessions', 'GET', '/api/coaching-sessions', { token: adminToken });
    await req('get session by id', 'GET', `/api/coaching-sessions/${sessionId}`, { token: adminToken });

    // Agent joins session → emitSessionJoin
    await req('agent joins session → business.session.join metric', 'POST', `/api/coaching-sessions/${sessionId}/join`, {
      token: agentToken,
    });

    await req('update session', 'PUT', `/api/coaching-sessions/${sessionId}`, {
      token: adminToken,
      body: { title: 'Sentry Seed Session (updated)' },
    });

    // Cleanup — delete created session
    await req('delete session (cleanup)', 'DELETE', `/api/coaching-sessions/${sessionId}`, {
      token: adminToken,
    });
  } else {
    console.log('  ⚠  session ID not found in response — skipping lifecycle steps');
  }

  // -------------------------------------------------------------------------
  // 6. Logout (as admin) — one final auth span
  // -------------------------------------------------------------------------
  console.log('\n── Cleanup ───────────────────────────────────────');
  await req('logout admin', 'POST', '/api/auth/logout', { token: adminToken });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const total = passCount + failCount;
  console.log(`\n────────────────────────────────────────────────────`);
  console.log(`  Results: ${passCount}/${total} passed${failCount > 0 ? `, ${failCount} unexpected` : ''}`);
  console.log(`\n  Metrics now flowing to Sentry. Wait ~2-5 minutes,`);
  console.log(`  then check Sentry → Metrics explorer or dashboard`);
  console.log(`  widget builder — attribute dropdowns should populate.`);
  console.log(`────────────────────────────────────────────────────\n`);

  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌  Fatal error:', err);
  process.exit(1);
});
