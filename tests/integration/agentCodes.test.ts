import path from 'path';
import request from 'supertest';

import app from '@src/app';
import { supabaseService } from '@src/services/supabase.service';

/******************************************************************************
  Integration — POST /api/agent-codes
******************************************************************************/

const manifest = require(path.join(
  __dirname,
  '../../scripts/seed-manifest.json',
)) as {
  tenantId: string;
  tenantSlug: string;
  adminPassword: string;
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
};

const TENANT_SLUG = manifest.tenantSlug;
const TENANT_ID = manifest.tenantId;

const ADMIN_EMAIL = manifest.users.admin.email;
const ADMIN_PASSWORD = manifest.adminPassword;

const AGENT_EMAIL = manifest.users.mdrt_stars_agent.email;
const AGENT_PASSWORD = manifest.password;

let adminToken: string | null = null;
let agentToken: string | null = null;

/** Track every agent_code created by the test so afterAll can clean them up. */
const createdCodes = new Set<string>();

function uniqueCode(): string {
  return `TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

/******************************************************************************
  beforeAll — obtain tokens
******************************************************************************/

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  if (adminRes.status === 200 && adminRes.body?.data?.token) {
    adminToken = adminRes.body.data.token as string;
  }

  const agentRes = await request(app)
    .post('/api/auth/login')
    .set('X-Tenant-Slug', TENANT_SLUG)
    .send({ email: AGENT_EMAIL, password: AGENT_PASSWORD });

  if (agentRes.status === 200 && agentRes.body?.data?.token) {
    agentToken = agentRes.body.data.token as string;
  }
}, 30000);

/******************************************************************************
  afterAll — delete every agent_code created by the test (best-effort)
******************************************************************************/

afterAll(async () => {
  for (const c of createdCodes) {
    try {
      await supabaseService.adminDelete('agent_codes', {
        tenant_id: TENANT_ID,
        agent_code: c,
      });
    } catch {
      // best-effort
    }
  }
});

/******************************************************************************
  POST /api/agent-codes — happy path
******************************************************************************/

describe('POST /api/agent-codes — happy path', () => {
  it('returns 200 with agentCodes array when admin creates 3 fresh codes', async () => {
    const codes = [uniqueCode(), uniqueCode(), uniqueCode()];
    codes.forEach((c) => createdCodes.add(c));

    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: codes });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('agentCodes');
    expect(Array.isArray(res.body.agentCodes)).toBe(true);
    expect(res.body.agentCodes).toHaveLength(3);
    for (const entry of res.body.agentCodes) {
      expect(codes).toContain(entry.agentCode);
      expect(entry.isUsed).toBe(false);
      expect(typeof entry.createdAt).toBe('string');
      expect(typeof entry.updatedAt).toBe('string');
    }
  });

  it('is idempotent — re-submitting the same codes returns 200 with the same entries and no duplicate rows', async () => {
    const c1 = uniqueCode();
    const c2 = uniqueCode();
    createdCodes.add(c1);
    createdCodes.add(c2);

    // First call — inserts
    await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: [c1, c2] });

    // Second call — upserts, must not create duplicates
    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: [c1, c2] });

    expect(res.status).toBe(200);
    expect(res.body.agentCodes).toHaveLength(2);

    const selectRes = await supabaseService.adminSelect(
      'agent_codes',
      '*',
      { tenant_id: TENANT_ID },
    );
    const rows = (selectRes.data ?? []) as unknown as { agent_code: string }[];
    expect(rows.filter((r) => r.agent_code === c1)).toHaveLength(1);
    expect(rows.filter((r) => r.agent_code === c2)).toHaveLength(1);
  });

  it('dedupes intra-batch duplicates — ["X","X","Y"] returns 2 entries', async () => {
    const c1 = uniqueCode();
    const c2 = uniqueCode();
    createdCodes.add(c1);
    createdCodes.add(c2);

    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: [c1, c1, c2] });

    expect(res.status).toBe(200);
    expect(res.body.agentCodes).toHaveLength(2);
  });
});

/******************************************************************************
  POST /api/agent-codes — auth and role guards
******************************************************************************/

describe('POST /api/agent-codes — guards', () => {
  it('returns 403 when the caller is not admin', async () => {
    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ agentCodes: [uniqueCode()] });

    expect(res.status).toBe(403);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app)
      .post('/api/agent-codes')
      .send({ agentCodes: [uniqueCode()] });

    expect(res.status).toBe(401);
  });
});

/******************************************************************************
  POST /api/agent-codes — validation
******************************************************************************/

describe('POST /api/agent-codes — validation', () => {
  it('returns 400 when agentCodes is an empty array', async () => {
    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: [] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when agentCodes contains a non-string entry', async () => {
    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: ['ok', 123] });

    expect(res.status).toBe(400);
  });

  it('returns 400 when agentCodes has more than 500 entries', async () => {
    const bigList = Array.from({ length: 501 }, (_, i) => `X${i}`);

    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: bigList });

    expect(res.status).toBe(400);
  });

  it('returns 400 when the body contains an unknown top-level field', async () => {
    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ agentCodes: [uniqueCode()], extra: 'nope' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when agentCodes is missing entirely', async () => {
    const res = await request(app)
      .post('/api/agent-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
