import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'change-me-too',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001').split(','),

  // Agora video/audio call credentials
  AGORA_APP_ID: process.env.AGORA_APP_ID || '',
  AGORA_APP_CERTIFICATE: process.env.AGORA_APP_CERTIFICATE || '',
};

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env');
}

if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
  console.warn('⚠️  AGORA_APP_ID or AGORA_APP_CERTIFICATE missing — call feature will not work');
}
