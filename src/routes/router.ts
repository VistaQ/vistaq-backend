import express from 'express';

import authRoutes from '@src/routes/auth.routes';
import userRoutes from '@src/routes/user.routes';

const router = express.Router();

/******************************************************************************
                        API ROUTES (/api/*)
******************************************************************************/

// NOTE: GET /health is registered directly in app.ts at root level (not under /api).

router.use('/auth', authRoutes);
router.use('/users', userRoutes);

export default router;
