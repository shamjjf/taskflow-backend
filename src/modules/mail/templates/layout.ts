import { env } from '@/config/env';

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface LayoutOptions {
  preheader?: string;
  title: string;
  intro?: string;
  bodyHtml: string;
  footerNote?: string;
}

export function renderLayout(opts: LayoutOptions): string {
  const appName = escapeHtml(env.APP_NAME);
  const appUrl = escapeHtml(env.APP_URL);
  const logoUrl = env.APP_LOGO_URL ? escapeHtml(env.APP_LOGO_URL) : '';
  const preheader = escapeHtml(opts.preheader ?? '');
  const title = escapeHtml(opts.title);
  const intro = opts.intro ? `<p style="margin:0 0 16px;color:#475569;line-height:1.55;">${escapeHtml(opts.intro)}</p>` : '';
  const footer = opts.footerNote
    ? `<p style="margin:16px 0 0;color:#94a3b8;font-size:12px;line-height:1.5;">${escapeHtml(opts.footerNote)}</p>`
    : '';

  const brandBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" height="32" style="display:block;border:0;outline:none;text-decoration:none;height:32px;" />`
    : `<span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${appName}</span>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
            <tr>
              <td style="background:linear-gradient(135deg,#4338ca 0%,#6366f1 100%);padding:24px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="vertical-align:middle;">${brandBlock}</td>
                    <td align="right" style="vertical-align:middle;color:#e0e7ff;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;">Daily Report</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px;">
                <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#0f172a;line-height:1.3;">${title}</h1>
                ${intro}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 28px;">
                ${opts.bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background:#f8fafc;padding:18px 28px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#64748b;font-size:12px;line-height:1.5;">
                  This is an automated message from <a href="${appUrl}" style="color:#4338ca;text-decoration:none;">${appName}</a>. Please do not reply.
                </p>
                ${footer}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;color:#94a3b8;font-size:11px;">© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
