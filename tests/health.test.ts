import request from 'supertest';

import app from '@src/app';
import { healthService } from '@src/services/health.service';
import { healthController } from '@src/controllers/health.controller';
import { HealthControllerError } from '@src/models/errors/health.error';
import type { IHealthRes } from '@src/models/health/health.interface';
import type { Request, Response, NextFunction } from 'express';

/******************************************************************************
  Integration — GET /health (via supertest)
******************************************************************************/

describe('GET /health — integration', () => {
  it('returns HTTP 200', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('response body contains status: "ok"', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toHaveProperty('status', 'ok');
  });

  it('response body contains a valid ISO timestamp string', async () => {
    const before = new Date().toISOString();
    const res = await request(app).get('/health');
    const after = new Date().toISOString();

    const { timestamp } = res.body as { timestamp: string };

    // Must be a string
    expect(typeof timestamp).toBe('string');

    // Must parse as a valid date
    const parsed = new Date(timestamp);
    expect(isNaN(parsed.getTime())).toBe(false);

    // Must be a proper ISO 8601 string (toISOString produces this format)
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Must fall within the window of this test execution
    expect(timestamp >= before).toBe(true);
    expect(timestamp <= after).toBe(true);
  });
});

/******************************************************************************
  Unit — HealthService.check()
******************************************************************************/

describe('HealthService.check() — unit', () => {
  it('returns an object with status: "ok"', () => {
    const result: IHealthRes = healthService.check();
    expect(result.status).toBe('ok');
  });

  it('returns an object with a timestamp property', () => {
    const result: IHealthRes = healthService.check();
    expect(result).toHaveProperty('timestamp');
  });

  it('timestamp is a valid ISO string', () => {
    const result: IHealthRes = healthService.check();
    const parsed = new Date(result.timestamp);
    expect(isNaN(parsed.getTime())).toBe(false);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('returned object conforms to IHealthRes shape', () => {
    const result: IHealthRes = healthService.check();
    expect(result).toEqual(
      expect.objectContaining<IHealthRes>({
        status: 'ok',
        timestamp: expect.any(String) as string,
      }),
    );
  });
});

/******************************************************************************
  Unit — HealthController error path
******************************************************************************/

describe('HealthController.check() — error path', () => {
  it('calls next(error) with a HealthControllerError when HealthService throws', () => {
    // Arrange: make healthService.check throw
    const serviceError = new Error('service layer exploded');
    jest.spyOn(healthService, 'check').mockImplementationOnce(() => {
      throw serviceError;
    });

    const req = {} as Request;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;
    const next = jest.fn() as NextFunction;

    // Act
    healthController.check(req, res, next);

    // Assert: next was called exactly once
    expect(next).toHaveBeenCalledTimes(1);

    // Assert: the argument passed to next is a HealthControllerError
    const passedError = (next as jest.Mock).mock.calls[0][0];
    expect(passedError).toBeInstanceOf(HealthControllerError);

    // Assert: the controller error wraps the original service error as its cause
    expect(passedError.cause).toBe(serviceError);

    // Assert: the response was never sent (controller must not reply on error)
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
