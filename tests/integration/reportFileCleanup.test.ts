import request from 'supertest';

import app from '@src/app';
import reportFileCleanupService from '@src/services/reportFileCleanup.service';

const INTERNAL_KEY = process.env.ETL_API_KEY ?? 'dev-internal-key-rotate-me';
const ENDPOINT = '/api/internal/cleanup-old-report-files';

describe('POST /api/internal/cleanup-old-report-files — auth', () => {
  it('returns 401 without internal key', async () => {
    const res = await request(app).post(ENDPOINT).send();
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong internal key', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', 'Bearer wrong')
      .send();
    expect(res.status).toBe(401);
  });
});

describe('POST /api/internal/cleanup-old-report-files — happy path', () => {
  let serviceSpy: jest.SpyInstance;

  beforeAll(() => {
    // Stub the service so the integration test does not actually delete
    // bytes from Storage or rely on seeded report-jobs older than 30 days.
    serviceSpy = jest
      .spyOn(reportFileCleanupService, 'cleanupOldReportFiles')
      .mockResolvedValue({ deletedCount: 4, failedCount: 1 });
  });

  afterAll(() => {
    serviceSpy.mockRestore();
  });

  it('returns 200 with the count payload when authenticated', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${INTERNAL_KEY}`)
      .send();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { deletedCount: 4, failedCount: 1 },
    });
    expect(serviceSpy).toHaveBeenCalledTimes(1);
  });
});
