import express from 'express';

import authRoutes from '@src/routes/auth.routes';

const router = express.Router();

/******************************************************************************
                        API ROUTES (/api/*)
******************************************************************************/

// NOTE: GET /health is registered directly in app.ts at root level (not under /api).

router.use('/auth', authRoutes);

export default router;
