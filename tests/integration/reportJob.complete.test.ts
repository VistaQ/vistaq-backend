import path from 'path';
import request from 'supertest';

import app from '@src/app';

const manifest = require(path.join(__dirname, '../../scripts/seed-manifest.json')) as {
  tenantSlug: string;
  password: string;
  users: Record<string, { email: string }>;
};

const GL_EMAIL = manifest.users.mdrt_stars_leader.email;
const GL_PASSWORD = manifest.password;
const INTERNAL_KEY = process.env.ETL_API_KEY ?? 'dev-internal-key-rotate-me';

let glToken: string | null = null;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', manifest.tenantSlug)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });
  if (res.status === 200) glToken = res.body?.data?.token as string;
}, 30000);

const sampleXlsx = path.join(__dirname, '../../docs/sample_report.xlsx');

describe('POST /api/reports/jobs/:reference/complete — guards', () => {
  const UNKNOWN_REF = 'SALES-REPORT-19990101000000000';

  it('returns 401 without internal key', async () => {
    const res = await request(app)
      .post(`/api/reports/jobs/${UNKNOWN_REF}/complete`)
      .send({ status: 'failed', error: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong internal key', async () => {
    const res = await request(app)
      .post(`/api/reports/jobs/${UNKNOWN_REF}/complete`)
      .set('Authorization', 'Bearer wrong')
      .send({ status: 'failed', error: 'x' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when reference does not exist', async () => {
    const res = await request(app)
      .post(`/api/reports/jobs/${UNKNOWN_REF}/complete`)
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({ status: 'failed', error: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('Full async lifecycle: upload → callback → completed', () => {
  it('persists data and marks job completed when ETL callbacks success', async () => {
    if (!glToken) throw new Error('login failed');

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

    let reference: string;
    try {
      const upload = await request(app)
        .post('/api/reports/jobs')
        .set('Authorization', `Bearer ${glToken}`)
        .field('reportYear', '2026')
        .field('reportMonth', '5')
        .attach('file', sampleXlsx);

      expect(upload.status).toBe(202);
      reference = upload.body.data.reference;
      expect(reference).toMatch(/^SALES-REPORT-\d{17}$/);
    } finally {
      global.fetch = originalFetch;
    }

    // Simulate ETL POSTing back the etl_result with the AG009 seeded agent code
    const etlResult = {
      source: 'sample_report.xlsx',
      created_at: '2026-06-01T00:00:00Z',
      rows_loaded: 1,
      months_detected: ['MAY'],
      records: [
        { agentCode: 'AG009', rowData: { 'FYC (YTD)': 295000, 'MAY ACE': 30000, 'MAY NOC': 2 } },
      ],
    };

    const cb = await request(app)
      .post(`/api/reports/jobs/${reference}/complete`)
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({ status: 'success', etl_result: etlResult });
    expect(cb.status).toBe(204);

    const get = await request(app)
      .get(`/api/reports/jobs/${reference}`)
      .set('Authorization', `Bearer ${glToken}`);
    expect(get.status).toBe(200);
    expect(get.body.data.status).toBe('completed');
    expect(get.body.data.batch_id).toEqual(expect.any(String));
  });
});
