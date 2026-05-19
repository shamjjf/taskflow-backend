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

  // SMTP / email
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_SECURE: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'TaskFlow <no-reply@taskflow.local>',

  // Branding shown in email templates
  APP_NAME: process.env.APP_NAME || 'TaskFlow',
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
  APP_LOGO_URL: process.env.APP_LOGO_URL || '',

  // Public URL of THIS backend (used in email "View Report" links).
  // In dev: http://localhost:<port>. In prod: the public https URL.
  API_PUBLIC_URL: process.env.API_PUBLIC_URL || `http://localhost:${parseInt(process.env.PORT || '5000', 10)}`,
  REPORT_FILE_TTL_DAYS: parseInt(process.env.REPORT_FILE_TTL_DAYS || '30', 10),

  // Daily report job — cron expression (default: 20:30 every day, server TZ)
  DAILY_REPORT_CRON: process.env.DAILY_REPORT_CRON || '30 20 * * *',
  DAILY_REPORT_TIMEZONE: process.env.DAILY_REPORT_TIMEZONE || 'Asia/Kolkata',
  DAILY_REPORT_ENABLED: (process.env.DAILY_REPORT_ENABLED || 'true').toLowerCase() === 'true',

  // Weekly report job — cron expression (default: 20:30 every Saturday)
  WEEKLY_REPORT_CRON: process.env.WEEKLY_REPORT_CRON || '30 20 * * 6',
  WEEKLY_REPORT_TIMEZONE: process.env.WEEKLY_REPORT_TIMEZONE || 'Asia/Kolkata',
  WEEKLY_REPORT_ENABLED: (process.env.WEEKLY_REPORT_ENABLED || 'true').toLowerCase() === 'true',
};

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env');
}

if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
  console.warn('⚠️  AGORA_APP_ID or AGORA_APP_CERTIFICATE missing — call feature will not work');
}

if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
  console.warn('⚠️  SMTP_HOST / SMTP_USER / SMTP_PASS missing — email notifications will not be delivered');
}
