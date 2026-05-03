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
const GL_EMAIL = manifest.users.mdrt_stars_leader.email;
const GL_PASSWORD = manifest.password;

let glToken: string | null = null;

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

beforeAll(async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });

  if (loginRes.status === 200 && loginRes.body?.data?.token) {
    glToken = loginRes.body.data.token as string;
  }

  if (glToken) {
    // Force the consecutive-month guard to pass regardless of DB state.
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
