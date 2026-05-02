import path from 'path';
import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — GET /api/reports/group/trend
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
  Fixture builder — mirrors salesReport.upload.test.ts
******************************************************************************/

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

/******************************************************************************
  beforeAll — log in and seed data so trend report has rows
******************************************************************************/

beforeAll(async () => {
  const loginRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });

  if (loginRes.status === 200 && loginRes.body?.data?.token) {
    glToken = loginRes.body.data.token as string;
  }

  // Upload seed data so the trend report has rows to return.
  // AG009 and AG010 are seeded agents in the demo-agency tenant.
  if (glToken) {
    await request(app)
      .post('/api/reports/upload')
      .set('Authorization', `Bearer ${glToken}`)
      .send({ etlResult: fixtureEtl(['AG009', 'AG010']) });
  }
}, 30000);

/******************************************************************************
  Happy path
******************************************************************************/

describe('GET /api/reports/group/trend — happy path', () => {
  it('returns 200 with array sorted by month ascending', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader; check seed data');

    const res = await request(app)
      .get('/api/reports/group/trend?year=2026')
      .set('Authorization', `Bearer ${glToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    // Only check sort order if there are 2+ entries (tolerant of empty data)
    const points = res.body.data as { month: number; fyc_mtd: number; fyct_mtd: number }[];
    for (let i = 1; i < points.length; i++) {
      expect(points[i - 1].month).toBeLessThan(points[i].month);
    }
  });
});

/******************************************************************************
  Guards
******************************************************************************/

describe('GET /api/reports/group/trend — guards', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/reports/group/trend?year=2026');

    expect(res.status).toBe(401);
  });

  it('returns 400 when year is missing', async () => {
    if (!glToken) throw new Error('Could not log in as group_leader');

    const res = await request(app)
      .get('/api/reports/group/trend')
      .set('Authorization', `Bearer ${glToken}`);

    expect(res.status).toBe(400);
  });
});
