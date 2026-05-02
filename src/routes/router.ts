import express from 'express';

import agentPointsRoutes from '@src/routes/agentPoints.routes';
import authRoutes from '@src/routes/auth.routes';
import publicRoutes from '@src/routes/public.routes';
import coachingSessionRoutes from '@src/routes/coachingSession.routes';
import dashboardRoutes from '@src/routes/dashboard.routes';
import leaderboardRoutes from '@src/routes/leaderboard.routes';
import eventRoutes from '@src/routes/event.routes';
import groupRoutes from '@src/routes/group.routes';
import pointActivityTypeRoutes from '@src/routes/pointActivityType.routes';
import pointConfigRoutes from '@src/routes/pointConfig.routes';
import prospectRoutes from '@src/routes/prospect.routes';
import salesReportRoutes from '@src/routes/salesReport.routes';
import userRoutes from '@src/routes/user.routes';

const router = express.Router();

/******************************************************************************
                        API ROUTES (/api/*)
******************************************************************************/

// NOTE: GET /health is registered directly in app.ts at root level (not under /api).

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/users', userRoutes);
router.use('/groups', groupRoutes);
router.use('/prospects', prospectRoutes);
router.use('/events', eventRoutes);
router.use('/coaching-sessions', coachingSessionRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/point-activity-types', pointActivityTypeRoutes);
router.use('/point-configs', pointConfigRoutes);
router.use('/leaderboard', leaderboardRoutes);
router.use('/agent-points', agentPointsRoutes);
router.use('/reports', salesReportRoutes);

export default router;
