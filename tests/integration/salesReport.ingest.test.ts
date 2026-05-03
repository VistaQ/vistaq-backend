import path from 'path';
import request from 'supertest';

import app from '@src/app';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

/******************************************************************************
  Integration — POST /api/reports/ingest

  Manual-mode endpoint: while the production HTTP-hosted ETL is being built,
  the ETL author runs the pipeline locally and POSTs the result directly to
  this endpoint. Authenticated via INTERNAL_API_KEY (no JWT, no report_jobs row).
******************************************************************************/

const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantId: string;
  tenantSlug: string;
  password: string;
  users: Record<
    string,
    { id: string; email: string; role: string; agentCode?: string }
  >;
};

const TENANT_ID = manifest.tenantId;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key-rotate-me';

/******************************************************************************
  Fixture builder
******************************************************************************/

const fixtureEtl = (agentCodes: string[]) => ({
  source: 'IngestIntegrationTest.xlsx',
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
  Auth guard
******************************************************************************/

describe('POST /api/reports/ingest — auth guard', () => {
  it('returns 401 without Authorization header', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 5,
        etl_result: fixtureEtl(['AG009']),
      });

    expect(res.status).toBe(401);
  });

  it('returns 401 with a wrong internal key', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', 'Bearer not-the-real-key')
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 5,
        etl_result: fixtureEtl(['AG009']),
      });

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  Validation
******************************************************************************/

describe('POST /api/reports/ingest — validation', () => {
  it('returns 400 with Validation failed when body is empty', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when tenant_id is not a uuid', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: 'not-a-uuid',
        report_year: 2026,
        report_month: 5,
        etl_result: fixtureEtl(['AG009']),
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when records array is empty', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 5,
        etl_result: {
          source: 'IngestIntegrationTest.xlsx',
          created_at: '2026-06-01T00:00:00Z',
          rows_loaded: 0,
          months_detected: ['MAY'],
          records: [],
        },
      });

    expect(res.status).toBe(400);
  });

  it('returns 400 when report_year is missing from the body', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_month: 5,
        etl_result: fixtureEtl(['AG009']),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('returns 400 when report_month is missing from the body', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        etl_result: fixtureEtl(['AG009']),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });
});

/******************************************************************************
  Happy path
******************************************************************************/

describe('POST /api/reports/ingest — happy path', () => {
  let latestSpy: jest.SpyInstance;

  beforeAll(() => {
    // Force the consecutive-month guard to pass regardless of DB state.
    latestSpy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(null);
  });

  afterAll(() => {
    latestSpy.mockRestore();
  });

  it('returns 200 with batchId, processed, skipped, errors for a valid payload', async () => {
    // AG009 and AG010 are the two seeded agents in the demo-agency tenant
    const seededAgentCodes = ['AG009', 'AG010'];

    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 5,
        etl_result: fixtureEtl(seededAgentCodes),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batchId).toEqual(expect.any(String));
    expect(res.body.data.processed).toBe(seededAgentCodes.length);
    expect(res.body.data.skipped).toBe(0);
    expect(res.body.data.errors).toEqual([]);
  });
});

/******************************************************************************
  Consecutive-month guard
******************************************************************************/

describe('POST /api/reports/ingest — skip-ahead guard', () => {
  let latestSpy: jest.SpyInstance;

  beforeAll(() => {
    latestSpy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(2);
  });

  afterAll(() => {
    latestSpy.mockRestore();
  });

  it('returns 409 when reportMonth skips ahead', async () => {
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 4,
        etl_result: fixtureEtl(['AG009']),
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/^Cannot upload 2026-04/);
    expect(res.body.message).toMatch(/cannot skip ahead/);
    expect(res.body.message).toMatch(/next allowed is 2026-03/);
  });
});

/******************************************************************************
  Re-upload corrections — must succeed
******************************************************************************/

describe('POST /api/reports/ingest — re-upload corrections allowed', () => {
  let latestSpy: jest.SpyInstance;

  beforeAll(() => {
    // Pretend month=5 is the latest already uploaded.
    latestSpy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(5);
  });

  afterAll(() => {
    latestSpy.mockRestore();
  });

  it('accepts re-upload of the latest month with 200 (data correction)', async () => {
    const seededAgentCodes = ['AG009', 'AG010'];
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 5,
        etl_result: fixtureEtl(seededAgentCodes),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batchId).toEqual(expect.any(String));
    expect(res.body.data.processed).toBe(seededAgentCodes.length);
  });

  it('accepts re-upload of an earlier month with 200 (historical correction)', async () => {
    const seededAgentCodes = ['AG009', 'AG010'];
    const res = await request(app)
      .post('/api/reports/ingest')
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({
        tenant_id: TENANT_ID,
        report_year: 2026,
        report_month: 2,
        etl_result: fixtureEtl(seededAgentCodes),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.batchId).toEqual(expect.any(String));
    expect(res.body.data.processed).toBe(seededAgentCodes.length);
  });
});
