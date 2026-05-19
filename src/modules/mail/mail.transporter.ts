import nodemailer, { Transporter } from 'nodemailer';
import { env } from '@/config/env';

let cached: Transporter | null = null;

export function getTransporter(): Transporter {
  if (cached) return cached;

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth:
      env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
  });

  return cached;
}

export async function verifyTransporter(): Promise<boolean> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return false;
  try {
    await getTransporter().verify();
    return true;
  } catch (err) {
    console.error('[Mail] SMTP verification failed:', err);
    return false;
  }
}
