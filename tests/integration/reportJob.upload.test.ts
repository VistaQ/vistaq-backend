import path from 'path';
import request from 'supertest';
import fs from 'fs';

import app from '@src/app';
import salesReportYtdRepository from '@src/repositories/salesReportYtd.repository';

const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantSlug: string;
  password: string;
  users: Record<string, { email: string }>;
};

const TENANT_SLUG = manifest.tenantSlug;
const GL_EMAIL = manifest.users.mdrt_stars_leader.email;
const GL_PASSWORD = manifest.password;

let glToken: string | null = null;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });
  if (res.status === 200) glToken = res.body?.data?.token as string;
}, 30000);

const sampleXlsx = path.join(__dirname, '../../docs/sample_report.xlsx');

describe('POST /api/reports/jobs — happy path', () => {
  let latestSpy: jest.SpyInstance;

  beforeAll(() => {
    latestSpy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(null);
  });

  afterAll(() => {
    latestSpy.mockRestore();
  });

  it('returns 202 with jobId for a valid multipart upload', async () => {
    if (!glToken) throw new Error('login failed; check seed-manifest');
    if (!fs.existsSync(sampleXlsx)) throw new Error('sample_report.xlsx not present');

    const originalFetch = global.fetch;
    // Only intercept requests to the ETL service; pass everything else
    // (supabase-js internal HTTP calls) through to the real fetch.
    global.fetch = jest.fn().mockImplementation((input: string | Request | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('localhost:8000')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ accepted: true }),
          text: async () => JSON.stringify({ accepted: true }),
        } as Response);
      }
      return originalFetch(input, init);
    }) as never;

    try {
      const res = await request(app)
        .post('/api/reports/jobs')
        .set('Authorization', `Bearer ${glToken}`)
        .field('reportYear', '2026')
        .field('reportMonth', '5')
        .attach('file', sampleXlsx);

      expect(res.status).toBe(202);
      expect(res.body.success).toBe(true);
      expect(res.body.data.jobId).toEqual(expect.any(String));
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('POST /api/reports/jobs — guards', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/reports/jobs')
      .field('reportYear', '2026')
      .field('reportMonth', '5')
      .attach('file', sampleXlsx);
    expect(res.status).toBe(401);
  });

  it('returns 400 when file is missing', async () => {
    if (!glToken) throw new Error('login failed');
    const res = await request(app)
      .post('/api/reports/jobs')
      .set('Authorization', `Bearer ${glToken}`)
      .field('reportYear', '2026')
      .field('reportMonth', '5');
    expect(res.status).toBe(400);
  });

  it('returns 400 when reportMonth is out of range', async () => {
    if (!glToken) throw new Error('login failed');
    const res = await request(app)
      .post('/api/reports/jobs')
      .set('Authorization', `Bearer ${glToken}`)
      .field('reportYear', '2026')
      .field('reportMonth', '13')
      .attach('file', sampleXlsx);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/reports/jobs — consecutive-month guard', () => {
  let latestSpy: jest.SpyInstance;

  beforeAll(() => {
    latestSpy = jest
      .spyOn(salesReportYtdRepository, 'findLatestUploadedMonth')
      .mockResolvedValue(2);
  });

  afterAll(() => {
    latestSpy.mockRestore();
  });

  it('returns 409 when reportMonth is non-consecutive', async () => {
    if (!glToken) throw new Error('login failed');
    if (!fs.existsSync(sampleXlsx)) throw new Error('sample_report.xlsx not present');

    const res = await request(app)
      .post('/api/reports/jobs')
      .set('Authorization', `Bearer ${glToken}`)
      .field('reportYear', '2026')
      .field('reportMonth', '4')
      .attach('file', sampleXlsx);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/^Cannot upload 2026-04/);
  });
});
