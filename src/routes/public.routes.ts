import express from 'express';

import publicController from '@src/controllers/public.controller';
import { IBaseReq } from '@src/models/interfaces/base.interface';

const router = express.Router();

router.get('/groups', (req, res, next) =>
  publicController.getGroups(req as unknown as IBaseReq, res, next),
);

export default router;
