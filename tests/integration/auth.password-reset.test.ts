import request from 'supertest';

import app from '@src/app';

/******************************************************************************
  Integration — POST /api/auth/forgot-password
                POST /api/auth/reset-password
******************************************************************************/

const TENANT_SLUG = 'demo-agency';
const VALID_EMAIL = 'demo.agent@example.com';

/******************************************************************************
  POST /api/auth/forgot-password — body validation
******************************************************************************/

describe('POST /api/auth/forgot-password — body validation', () => {
  it('returns 400 with "Validation failed" when email is missing', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with "Validation failed" when email format is invalid', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: 'not-a-valid-email' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  POST /api/auth/forgot-password — missing X-Tenant-Slug header
******************************************************************************/

describe('POST /api/auth/forgot-password — missing X-Tenant-Slug header', () => {
  it('returns 400 when X-Tenant-Slug header is absent', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(400);
  });
});

/******************************************************************************
  POST /api/auth/forgot-password — unknown tenant slug
******************************************************************************/

describe('POST /api/auth/forgot-password — unknown tenant slug', () => {
  it('returns 404 when the tenant slug does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Tenant-Slug', 'nonexistent-tenant-slug-xyz')
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(404);
  });
});

/******************************************************************************
  POST /api/auth/forgot-password — user enumeration protection
******************************************************************************/

describe('POST /api/auth/forgot-password — user enumeration protection', () => {
  it('returns 200 with success message even when the email does not exist (valid tenant)', async () => {
    // A random email that definitely does not belong to any user
    const nonExistentEmail = `nonexistent.${Date.now()}@example.com`;

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: nonExistentEmail });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message', 'Password reset email sent');
  });
});

/******************************************************************************
  POST /api/auth/forgot-password — happy path with existing email
******************************************************************************/

describe('POST /api/auth/forgot-password — existing email', () => {
  it('returns 200 with { success: true, message: "Password reset email sent" } for valid tenant + existing email', async () => {
    // Note: this test relies on a seeded user existing with this email in the
    // demo-agency tenant. If the email doesn't exist the service silently
    // returns and the response is still 200 (enumeration protection), so the
    // assertion holds regardless.
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .set('X-Tenant-Slug', TENANT_SLUG)
      .send({ email: VALID_EMAIL });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('message', 'Password reset email sent');
  });
});

/******************************************************************************
  POST /api/auth/reset-password — body validation
******************************************************************************/

describe('POST /api/auth/reset-password — body validation: missing fields', () => {
  it('returns 400 with "Validation failed" when both token and newPassword are missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with "Validation failed" when token is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ newPassword: 'NewSecret1!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 with "Validation failed" when newPassword is missing', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'some-reset-token' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

describe('POST /api/auth/reset-password — body validation: weak newPassword', () => {
  const VALID_TOKEN = 'some-reset-token';

  it('returns 400 when newPassword is too short (fewer than 6 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN, newPassword: 'Ab1!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when newPassword has no uppercase letter', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN, newPassword: 'secret1!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when newPassword has no digit', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN, newPassword: 'Secret!!' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });

  it('returns 400 when newPassword has no special character', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: VALID_TOKEN, newPassword: 'Secret11' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('message', 'Validation failed');
  });
});

/******************************************************************************
  POST /api/auth/reset-password — invalid/expired token
******************************************************************************/

describe('POST /api/auth/reset-password — invalid or expired token', () => {
  it('returns 500 when the token is invalid (Supabase rejects code exchange)', async () => {
    // A fabricated token that Supabase will reject. The service calls
    // exchangeCodeForSession which will error, bubbling up to a 500 via the
    // centralised error handler.
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'totally-invalid-token-12345', newPassword: 'NewSecret1!' });

    expect(res.status).toBe(500);
  });
});
