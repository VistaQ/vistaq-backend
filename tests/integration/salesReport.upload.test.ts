import path from 'path';
import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — POST /api/reports/upload
******************************************************************************/

// Credentials are sourced from the seed manifest written by scripts/bootstrap.js.
// Run `npx supabase db reset && node scripts/bootstrap.js` to regenerate.
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

/** JWT obtained in beforeAll */
let glToken: string | null = null;

/******************************************************************************
  Fixture builder
******************************************************************************/

const fixtureEtl = (agentCodes: string[]) => ({
  source: 'IntegrationTest.xlsx',
  created_at: '2026-06-01T00:00:00Z',
  rows_loaded: agentCodes.length,
  months_detected: ['MAY'],
  report_year: 2026,
  report_month: 5,
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

/******************************************************************************
  beforeAll
******************************************************************************/

beforeAll(async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });

  if (loginRes.status === 200 && loginRes.body?.data?.token) {
    glToken = loginRes.body.data.token as string;
  }
}, 30000);

/******************************************************************************
  Happy path
******************************************************************************/

describe('POST /api/reports/upload — happy path', () => {
  it('returns 200 with batchId + processed count for a valid ETL payload', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader; check seed data');

    // AG009 and AG010 are the two seeded agents in the demo-agency tenant
    const seededAgentCodes = ['AG009', 'AG010'];

    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({ etlResult: fixtureEtl(seededAgentCodes) });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batchId).toEqual(expect.any(String));
    expect(res.body.data.processed).toBe(seededAgentCodes.length);
    expect(res.body.data.errors).toEqual([]);
  });
});

/******************************************************************************
  Auth guard
******************************************************************************/

describe('POST /api/reports/upload — auth guard', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app)
      .post('/api/reports/upload')
      .send({ etlResult: fixtureEtl(['AG009']) });

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  Validation
******************************************************************************/

describe('POST /api/reports/upload — validation', () => {
  it('returns 400 with Validation failed when body is empty', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');

    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when records array is empty', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');

    const res = await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({
        etlResult: {
          source: 'IntegrationTest.xlsx',
          created_at: '2026-06-01T00:00:00Z',
          rows_loaded: 0,
          months_detected: ['MAY'],
          report_year: 2026,
          report_month: 5,
          records: [],
        },
      });

    expect(res.status).toBe(400);
  });
});
