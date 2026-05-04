import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';

import { env } from '@/config/env';

import authRoutes from '@/modules/auth/auth.routes';
import usersRoutes from '@/modules/users/users.routes';
import departmentsRoutes from '@/modules/departments/departments.routes';
import tasksRoutes from '@/modules/tasks/tasks.routes';
import reportsRoutes from '@/modules/reports/reports.routes';
import chatRoutes from '@/modules/chat/chat.routes';
import notificationsRoutes from '@/modules/notifications/notifications.routes';
import activityRoutes from '@/modules/activity/activity.routes';
import analyticsRoutes from '@/modules/analytics/analytics.routes';
import uploadsRoutes from '@/modules/upload/uploads.routes'
import agoraRoutes from '@/modules/agora/agora.routes';

import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';

export function createApp(): Application {
  const app = express();



  // Security + parsing
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Logging
  if (env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // Serve uploaded files statically
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  // Rate limiting (only on /api routes)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', limiter);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/departments', departmentsRoutes);
  app.use('/api/tasks', tasksRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/conversations', chatRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/activity-logs', activityRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/uploads', uploadsRoutes);
  app.use('/api/agora', agoraRoutes);

  // 404 + error handlers (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
