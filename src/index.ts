import { createServer } from 'http';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { initSocketServer } from '@/sockets';
import { prisma } from '@/config/prisma';
import { startOverdueChecker } from '@/utils/overdueChecker';
import { startDailyReportScheduler, stopDailyReportScheduler } from '@/utils/dailyReportScheduler';
import { startWeeklyReportScheduler, stopWeeklyReportScheduler } from '@/utils/weeklyReportScheduler';
import { verifyTransporter } from '@/modules/mail/mail.transporter';
import { ensureSuperAdmin } from '@/utils/superAdminSeeder';

async function main() {
  const app = createApp();
  const httpServer = createServer(app);

  // Initialize Socket.IO
  initSocketServer(httpServer);

  // Test DB connection
  try {
    await prisma.$connect();
    console.log('✓ Database connected');
  } catch (err) {
    console.error('✗ Database connection failed:', err);
    process.exit(1);
  }

  // Bootstrap a super admin if none exists
  try {
    const result = await ensureSuperAdmin();
    if (result.created) {
      console.log(`✓ Super admin bootstrapped: ${result.email}`);
    } else {
      console.log('✓ Super admin already exists');
    }
  } catch (err) {
    console.error('✗ Super admin bootstrap failed:', err);
  }

  // Start overdue task checker (runs every 5 minutes)
  const overdueInterval = startOverdueChecker(5);
  console.log('✓ Overdue task checker started (runs every 5 min)');

  // Verify SMTP and schedule the daily 20:30 report email
  verifyTransporter().then((ok) => {
    console.log(ok ? '✓ SMTP transporter verified' : '⚠ SMTP transporter not verified — emails will fail until configured');
  });
  startDailyReportScheduler();
  startWeeklyReportScheduler();

  httpServer.listen(env.PORT, () => {
    console.log('');
    console.log('🚀 TaskFlow API');
    console.log(`   Environment:  ${env.NODE_ENV}`);
    console.log(`   HTTP:         http://localhost:${env.PORT}`);
    console.log(`   WebSocket:    ws://localhost:${env.PORT}`);
    console.log(`   CORS origins: ${env.CORS_ORIGINS.join(', ')}`);
    console.log('');
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    clearInterval(overdueInterval);
    stopDailyReportScheduler();
    stopWeeklyReportScheduler();
    httpServer.close(() => {
      prisma.$disconnect().then(() => process.exit(0));
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
