import path from 'path';
import request from 'supertest';

import app from '@src/app';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

/******************************************************************************
  Integration — GET /api/sales-reports/me?year=
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
const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;

let glToken: string | null = null;
let agentToken: string | null = null;

const fixtureEtl = (agentCodes: string[]) => ({
  source: 'IntegrationTest.xlsx',
  created_at: '2026-06-01T00:00:00Z',
  rows_loaded: agentCodes.length,
  months_detected: ['MAY'],
  records: agentCodes.map((c) => ({
    agentCode: c,
    rowData: {
      'ACE (YTD)': 100, 'NOC (YTD)': 5, 'FYCT (YTD)': 80,
      '% FYCT (YTD)': 0.4, 'MDRT SHORTAGE FYCT': 20,
      'FYC (YTD)': 70, '% FYC (YTD)': 0.35, 'MDRT SHORTAGE FYC': 30,
      'MAY ACE': 30, 'MAY NOC': 2,
    },
  })),
});

beforeAll(async () => {
  const glLogin = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GL_EMAIL, password: PASSWORD });
  if (glLogin.status === 200 && glLogin.body?.data?.token) {
    glToken = glLogin.body.data.token as string;
  }

  const agentLogin = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: AGENT_EMAIL, password: PASSWORD });
  if (agentLogin.status === 200 && agentLogin.body?.data?.token) {
    agentToken = agentLogin.body.data.token as string;
  }

  // Seed: upload report for AG009 + AG010 so the agent has a YTD row.
  if (glToken) {
    const spy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(null);
    await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({
        report_year: 2026,
        report_month: 5,
        etlResult: fixtureEtl(['AG009', 'AG010']),
      });
    spy.mockRestore();
  }
}, 30000);

describe('GET /api/sales-reports/me — happy path', () => {
  it('returns 200 with the calling agent\'s SalesReport', async () => {
    if (!agentToken) throw new Error('Could not log in as agent; check seed data');

    const res = await request(app)
      .get('/api/sales-reports/me?year=2026')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('agent_id');
    expect(res.body.data).toHaveProperty('year', 2026);
    expect(res.body.data.month_ace).toHaveLength(12);
  });
});

describe('GET /api/sales-reports/me — 404 when no data', () => {
  it('returns 404 with the documented message when the user has no YTD row for the year', async () => {
    if (!agentToken) throw new Error('Could not log in as agent');

    const res = await request(app)
      .get('/api/sales-reports/me?year=2099')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('No sales report for this year');
  });
});

describe('GET /api/sales-reports/me — guards', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/sales-reports/me?year=2026');
    expect(res.status).toBe(401);
  });

  it('returns 400 when year is missing', async () => {
    if (!agentToken) throw new Error('Could not log in as agent');
    const res = await request(app)
      .get('/api/sales-reports/me')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(400);
  });
});
