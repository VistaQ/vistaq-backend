const getActiveGroups = jest.fn();

jest.mock('@src/services/group.service', () => ({
  __esModule: true,
  groupService: { getActiveGroups },
  default: { getActiveGroups },
}));

import type { NextFunction, Response } from 'express';

import { publicController } from '@src/controllers/public.controller';
import { ControllerError } from '@src/models/errors/layer.errors';
import type { IBaseReq } from '@src/models/interfaces/base.interface';

const groups = [
  { id: '11111111-2222-3333-4444-555555555555', name: 'Alpha Squad' },
  { id: '22222222-3333-4444-5555-666666666666', name: 'Beta Team' },
];

const makeRes = () => {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};

beforeEach(() => jest.resetAllMocks());

describe('PublicController.getGroups', () => {
  it('returns 200 with the active groups and needs no tenant header', async () => {
    getActiveGroups.mockResolvedValue(groups);
    const res = makeRes();

    await publicController.getGroups(
      { headers: {} } as unknown as IBaseReq,
      res as unknown as Response,
      jest.fn() as unknown as NextFunction,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: groups });
  });

  it('forwards a service failure as a ControllerError', async () => {
    getActiveGroups.mockRejectedValue(new Error('boom'));
    const next = jest.fn();

    await publicController.getGroups(
      { headers: {} } as unknown as IBaseReq,
      makeRes() as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next.mock.calls[0][0]).toBeInstanceOf(ControllerError);
  });
});
