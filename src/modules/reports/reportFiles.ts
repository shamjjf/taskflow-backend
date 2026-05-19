import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { env } from '@/config/env';

const REPORTS_DIR = path.join(process.cwd(), 'report-files');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const FILENAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

function getSecret(): string {
  return env.JWT_ACCESS_SECRET;
}

function sign(filename: string, expires: number): string {
  return crypto
    .createHmac('sha256', getSecret())
    .update(`${filename}.${expires}`)
    .digest('hex');
}

export function isSafeFilename(name: string): boolean {
  return FILENAME_PATTERN.test(name);
}

export function saveReportFile(filename: string, content: Buffer): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  fs.writeFileSync(path.join(REPORTS_DIR, safe), content);
  return safe;
}

export function getReportFilePath(filename: string): string {
  return path.join(REPORTS_DIR, filename);
}

export function buildSignedReportUrl(filename: string, ttlDays: number = env.REPORT_FILE_TTL_DAYS): string {
  const expires = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const token = sign(filename, expires);
  const base = env.API_PUBLIC_URL.replace(/\/$/, '');
  return `${base}/api/reports/files/${encodeURIComponent(filename)}?token=${token}&expires=${expires}`;
}

export function verifyReportToken(filename: string, expires: number, token: string): boolean {
  if (!Number.isFinite(expires)) return false;
  if (Math.floor(Date.now() / 1000) > expires) return false;
  const expected = sign(filename, expires);
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}
