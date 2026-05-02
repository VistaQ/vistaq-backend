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
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? 'dev-internal-key-rotate-me';

let glToken: string | null = null;

beforeAll(async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', manifest.tenantSlug)
    .send({ email: GL_EMAIL, password: GL_PASSWORD });
  if (res.status === 200) glToken = res.body?.data?.token as string;
}, 30000);

const sampleXlsx = path.join(__dirname, '../../docs/sample_report.xlsx');

async function uploadJob(token: string): Promise<string> {
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
      .set('Authorization', `Bearer ${token}`)
      .field('reportYear', '2026').field('reportMonth', '5')
      .attach('file', sampleXlsx);
    return res.body.data.reference as string;
  } finally {
    global.fetch = originalFetch;
  }
}

describe('POST /api/reports/jobs/:reference/retry — only failed jobs', () => {
  it('returns 409 Conflict when retrying a non-failed job', async () => {
    if (!glToken) throw new Error('login failed');

    const reference = await uploadJob(glToken);
    expect(reference).toMatch(/^SALES-REPORT-\d{17}$/);

    // Job is in 'pending' (or 'processing' if the kickoff was synchronous in this test env) — retry should reject
    const retry = await request(app)
      .post(`/api/reports/jobs/${reference}/retry`)
      .set('Authorization', `Bearer ${glToken}`);
    expect(retry.status).toBe(409);
  });

  it('returns 202 when retrying a failed job', async () => {
    if (!glToken) throw new Error('login failed');

    const reference = await uploadJob(glToken);

    // Mark the job failed via the callback path
    await request(app)
      .post(`/api/reports/jobs/${reference}/complete`)
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send({ status: 'failed', error: 'simulated failure' });

    // Now retry should succeed (re-mock fetch since the previous one was restored)
    const originalFetch = global.fetch;
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
      const retry = await request(app)
        .post(`/api/reports/jobs/${reference}/retry`)
        .set('Authorization', `Bearer ${glToken}`);
      expect(retry.status).toBe(202);
      expect(retry.body.data.reference).toBe(reference);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
