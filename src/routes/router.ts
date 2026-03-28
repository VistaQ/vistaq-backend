import express from 'express';

import authRoutes from '@src/routes/auth.routes';
import dashboardRoutes from '@src/routes/dashboard.routes';
import eventRoutes from '@src/routes/event.routes';
import groupRoutes from '@src/routes/group.routes';
import pointConfigRoutes from '@src/routes/pointConfig.routes';
import prospectRoutes from '@src/routes/prospect.routes';
import userRoutes from '@src/routes/user.routes';

const router = express.Router();

/******************************************************************************
                        API ROUTES (/api/*)
******************************************************************************/

// NOTE: GET /health is registered directly in app.ts at root level (not under /api).

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/groups', groupRoutes);
router.use('/prospects', prospectRoutes);
router.use('/events', eventRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/point-configs', pointConfigRoutes);

export default router;
