import { createServer } from 'http';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { initSocketServer } from '@/sockets';
import { prisma } from '@/config/prisma';
import { startOverdueChecker } from '@/utils/overdueChecker';

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

  // Start overdue task checker (runs every 5 minutes)
  const overdueInterval = startOverdueChecker(5);
  console.log('✓ Overdue task checker started (runs every 5 min)');

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
