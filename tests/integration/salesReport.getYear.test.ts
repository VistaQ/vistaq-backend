import path from 'path';
import request from 'supertest';

import app from '@src/app';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

/******************************************************************************
  Integration — GET /api/sales-reports?year=
******************************************************************************/

const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantSlug: string;
  password: string;
  users: Record<
    string,
    { id: string; email: string; role: string; agentCode?: string; groupId?: string }
  >;
};

const TENANT_SLUG = manifest.tenantSlug;
const PASSWORD = manifest.password;
const GL_EMAIL = manifest.users.mdrt_stars_leader.email;
const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = (manifest as unknown as { adminPassword: string })
  .adminPassword;
const MASTER_EMAIL = manifest.users.masterTrainer1.email;
const TRAINER_EMAIL = manifest.users.mdrt_stars_trainer.email;
const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;

const MDRT_STARS_AGENT_CODES = ['AG006', 'AG009'];

let glToken: string | null = null;
let adminToken: string | null = null;
let masterToken: string | null = null;
let trainerToken: string | null = null;
let agentToken: string | null = null;

const fixtureEtl = (agentCodes: string[]) => ({
  source: 'IntegrationTest.xlsx',
  created_at: '2026-06-01T00:00:00Z',
  rows_loaded: agentCodes.length,
  months_detected: ['MAY'],
  records: agentCodes.map((c) => ({
    agentCode: c,
    rowData: {
      'ACE (YTD)': 100,
      'NOC (YTD)': 5,
      'FYCT (YTD)': 80,
      '% FYCT (YTD)': 0.4,
      'MDRT SHORTAGE FYCT': 20,
      'FYC (YTD)': 70,
      '% FYC (YTD)': 0.35,
      'MDRT SHORTAGE FYC': 30,
      'MAY ACE': 30,
      'MAY NOC': 2,
    },
  })),
});

async function login(
  email: string,
  password: string,
): Promise<string | null> {
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email, password });
  if (res.status === 200 && res.body?.data?.token) {
    return res.body.data.token as string;
  }
  return null;
}

beforeAll(async () => {
  glToken = await login(GL_EMAIL, PASSWORD);
  adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  masterToken = await login(MASTER_EMAIL, PASSWORD);
  trainerToken = await login(TRAINER_EMAIL, PASSWORD);
  agentToken = await login(AGENT_EMAIL, PASSWORD);

  if (glToken) {
    // Force the consecutive-month guard to pass regardless of DB state.
    const spy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(null);
    // Upload covers all six seeded agents (AG006..AG011) so role-scope
    // assertions below have a stable expected slice.
    await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({
        report_year: 2026,
        report_month: 5,
        etlResult: fixtureEtl([
          'AG006', 'AG007', 'AG008', 'AG009', 'AG010', 'AG011',
        ]),
      });
    spy.mockRestore();
  }
}, 30000);

describe('GET /api/sales-reports — happy path', () => {
  it('returns 200 with an array of SalesReport objects shaped for the FE', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader; check seed data');

    const res = await request(app)
      .get('/api/sales-reports?year=2026')
      .set('Authorization', `Bearer ${glToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const r = res.body.data[0];
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('agent_id');
      expect(r).toHaveProperty('agent_code');
      expect(r).toHaveProperty('agent_name');
      expect(r).toHaveProperty('year', 2026);
      expect(r).toHaveProperty('imported_at');
      expect(Array.isArray(r.month_ace)).toBe(true);
      expect(r.month_ace).toHaveLength(12);
      expect(Array.isArray(r.month_noc)).toBe(true);
      expect(r.month_noc).toHaveLength(12);
      expect(Array.isArray(r.month_fyc)).toBe(true);
      expect(r.month_fyc).toHaveLength(12);
      expect(Array.isArray(r.month_fyct)).toBe(true);
      expect(r.month_fyct).toHaveLength(12);
    }
  });
});

describe('GET /api/sales-reports — role-based scoping', () => {
  it('admin sees all 6 seeded agents (AG006..AG011)', async () => {
    if (!adminToken) throw new Error('Could not log in as admin');
    const res = await request(app)
      .get('/api/sales-reports?year=2026')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const codes: string[] = res.body.data.map(
      (r: { agent_code: string }) => r.agent_code,
    );
    for (const c of ['AG006', 'AG007', 'AG008', 'AG009', 'AG010', 'AG011']) {
      expect(codes).toContain(c);
    }
  });

  it('master_trainer sees all 6 seeded agents', async () => {
    if (!masterToken) throw new Error('Could not log in as master_trainer');
    const res = await request(app)
      .get('/api/sales-reports?year=2026')
      .set('Authorization', `Bearer ${masterToken}`);

    expect(res.status).toBe(200);
    const codes: string[] = res.body.data.map(
      (r: { agent_code: string }) => r.agent_code,
    );
    for (const c of ['AG006', 'AG007', 'AG008', 'AG009', 'AG010', 'AG011']) {
      expect(codes).toContain(c);
    }
  });

  it('trainer sees only the agents in their managed groups (mdrt_stars: AG006 + AG009)', async () => {
    if (!trainerToken) throw new Error('Could not log in as trainer');
    const res = await request(app)
      .get('/api/sales-reports?year=2026')
      .set('Authorization', `Bearer ${trainerToken}`);

    expect(res.status).toBe(200);
    const codes: string[] = res.body.data
      .map((r: { agent_code: string }) => r.agent_code)
      .sort();
    expect(codes).toEqual(MDRT_STARS_AGENT_CODES);
  });

  it('group_leader sees only the agents in their own group', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');
    const res = await request(app)
      .get('/api/sales-reports?year=2026')
      .set('Authorization', `Bearer ${glToken}`);

    expect(res.status).toBe(200);
    const codes: string[] = res.body.data
      .map((r: { agent_code: string }) => r.agent_code)
      .sort();
    expect(codes).toEqual(MDRT_STARS_AGENT_CODES);
  });

  it('agent gets 403', async () => {
    if (!agentToken) throw new Error('Could not log in as agent');
    const res = await request(app)
      .get('/api/sales-reports?year=2026')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/sales-reports — guards', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/sales-reports?year=2026');
    expect(res.status).toBe(401);
  });

  it('returns 400 when year is missing', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');
    const res = await request(app)
      .get('/api/sales-reports')
      .set('Authorization', `Bearer ${glToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when year is out of range', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');
    const res = await request(app)
      .get('/api/sales-reports?year=1999')
      .set('Authorization', `Bearer ${glToken}`);
    expect(res.status).toBe(400);
  });
});
