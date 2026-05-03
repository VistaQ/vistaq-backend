import path from 'path';
import request from 'supertest';

import app from '@src/app';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

/******************************************************************************
  Integration — GET /api/sales-reports/uploads
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
const TRAINER_EMAIL = manifest.users.mdrt_stars_trainer.email;

let glToken: string | null = null;
let agentToken: string | null = null;
let trainerToken: string | null = null;

const fixtureEtl = (agentCodes: string[]) => ({
  source: 'AuditTest.xlsx',
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

  const trainerLogin = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: TRAINER_EMAIL, password: PASSWORD });
  if (trainerLogin.status === 200 && trainerLogin.body?.data?.token) {
    trainerToken = trainerLogin.body.data.token as string;
  }

  // Seed at least one upload row so the audit list is non-empty.
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

describe('GET /api/sales-reports/uploads — happy path', () => {
  it('returns 200 with paginated audit entries and the documented meta shape', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader; check seed data');

    const res = await request(app)
      .get('/api/sales-reports/uploads?year=2026&page=1&pageSize=50')
      .set('Authorization', `Bearer ${glToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toEqual({
      page: 1,
      pageSize: 50,
      total: expect.any(Number),
    });

    if (res.body.data.length > 0) {
      const e = res.body.data[0];
      expect(e).toHaveProperty('id');
      expect(e).toHaveProperty('year');
      expect(e).toHaveProperty('month');
      expect(e).toHaveProperty('file_name');
      expect(e).toHaveProperty('rows_loaded');
      expect(e).toHaveProperty('rows_skipped');
      expect(e).toHaveProperty('status');
      expect(e).toHaveProperty('uploader_name');
      expect(e).toHaveProperty('imported_at');
    }
  });

  it('defaults page=1 and pageSize=50 when omitted', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');

    const res = await request(app)
      .get('/api/sales-reports/uploads?year=2026')
      .set('Authorization', `Bearer ${glToken}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(50);
  });
});

describe('GET /api/sales-reports/uploads — guards', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/sales-reports/uploads?year=2026');
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is a plain agent', async () => {
    if (!agentToken) throw new Error('Could not log in as agent');
    const res = await request(app)
      .get('/api/sales-reports/uploads?year=2026')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 200 when caller is a trainer (audit list is tenant-wide for managers)', async () => {
    if (!trainerToken) throw new Error('Could not log in as trainer');
    const res = await request(app)
      .get('/api/sales-reports/uploads?year=2026')
      .set('Authorization', `Bearer ${trainerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns 400 when year is missing', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');
    const res = await request(app)
      .get('/api/sales-reports/uploads')
      .set('Authorization', `Bearer ${glToken}`);
    expect(res.status).toBe(400);
  });

  it('returns 400 when pageSize exceeds 200', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');
    const res = await request(app)
      .get('/api/sales-reports/uploads?year=2026&pageSize=500')
      .set('Authorization', `Bearer ${glToken}`);
    expect(res.status).toBe(400);
  });
});
