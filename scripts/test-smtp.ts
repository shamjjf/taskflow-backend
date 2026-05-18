/**
 * SMTP test CLI.
 *
 * Sends a test email through the project's mailService so you can validate
 * SMTP credentials and visually inspect any template before wiring it into
 * a real flow.
 *
 * Usage (from taskflow-backend/):
 *   npm run test:smtp -- --to someone@example.com
 *   npm run test:smtp -- --to a@x.com,b@y.com --subject "Hello" --html "<p>Hi</p>"
 *   npm run test:smtp -- --to a@x.com --html-file ./preview.html --layout
 *   npm run test:smtp -- --to a@x.com --template daily-report
 *   npm run test:smtp -- --verify-only
 *
 * Flags:
 *   --to <addr[,addr...]>     Recipient(s). Required unless --verify-only.
 *   --cc <addr[,addr...]>     CC recipients.
 *   --bcc <addr[,addr...]>    BCC recipients.
 *   --subject <text>          Subject. Default: "TaskFlow SMTP test — <ISO>".
 *   --html <inline-html>      Inline HTML body.
 *   --html-file <path>        Read HTML body from a file.
 *   --text <text>             Plain-text alternative. Default: stripped from HTML.
 *   --template <name>         Use a built-in template by name. See TEMPLATES below.
 *   --layout                  Wrap the HTML in the project's branded layout.
 *   --title <text>            Title shown in the layout header (with --layout).
 *   --intro <text>            Intro paragraph shown in the layout (with --layout).
 *   --reply-to <addr>         Reply-To header.
 *   --verify-only             Only verify SMTP credentials; do not send.
 *
 * Exit codes: 0 ok, 1 verify/send failed, 2 some recipients rejected.
 */

import fs from 'fs';
import path from 'path';
import { env } from '@/config/env';
import { mailService, MailAttachment } from '@/modules/mail/mail.service';
import { verifyTransporter } from '@/modules/mail/mail.transporter';
import { renderLayout } from '@/modules/mail/templates/layout';

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const key = tok.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function splitList(value: string | boolean | undefined): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  const parts = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Built-in templates so devs can quickly preview canonical layouts.
 * Add new entries here when introducing a new email template.
 */
interface RenderedTemplate {
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

const TEMPLATES: Record<string, () => RenderedTemplate | Promise<RenderedTemplate>> = {
  'plain-test': () => {
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
        <h2 style="color:#111827;margin:0 0 12px">${env.APP_NAME ?? 'TaskFlow'} — SMTP test</h2>
        <p style="color:#374151">This is a test email sent from the TaskFlow backend to verify SMTP delivery.</p>
        <ul style="color:#374151">
          <li><b>Host:</b> ${env.SMTP_HOST}:${env.SMTP_PORT}</li>
          <li><b>Secure:</b> ${env.SMTP_SECURE}</li>
          <li><b>From:</b> ${env.SMTP_FROM}</li>
          <li><b>Sent at:</b> ${new Date().toLocaleString()}</li>
        </ul>
      </div>
    `;
    return { subject: `TaskFlow SMTP test — ${new Date().toISOString()}`, html };
  },

  'branded-test': () => {
    const html = renderLayout({
      title: 'SMTP delivery test',
      preheader: 'Verifying that branded emails render correctly.',
      intro: 'If you can read this, the branded layout is rendering and SMTP delivery is working.',
      bodyHtml: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td style="padding:12px 0;font-size:13px;color:#475569;">
              <p style="margin:0 0 12px;">Sent at: <b>${new Date().toLocaleString()}</b></p>
              <p style="margin:0;">Use the test-smtp CLI to preview new templates before wiring them into a real flow.</p>
            </td>
          </tr>
        </table>
      `,
      footerNote: 'Sent via scripts/test-smtp.ts',
    });
    return { subject: `TaskFlow branded SMTP test — ${new Date().toISOString()}`, html };
  },

  'daily-report': async () => {
    // Lazy require so this script does not pull in report code unless asked.
    const { renderDailyReportEmail } = await import('@/modules/mail/templates/dailyReport.template');
    const { buildDailyReportXlsx } = await import('@/modules/reports/dailyReportXlsx');

    const today = new Date().toISOString().slice(0, 10);
    const attachmentFilename = `taskflow-daily-report-${today}.xlsx`;

    const tableRows = [
      { serial: 1, employeeName: 'Alice Singh',  designation: 'Senior Engineer', teamLeader: 'Ravi Kumar',   department: 'Engineering', date: today, submitted: true  },
      { serial: 2, employeeName: 'Bob Verma',    designation: 'Product Designer', teamLeader: 'Ravi Kumar',   department: 'Design',      date: today, submitted: true  },
      { serial: 3, employeeName: 'Chitra Rao',   designation: 'Data Analyst',    teamLeader: 'Meera Joshi',  department: 'Operations',  date: today, submitted: false },
      { serial: 4, employeeName: 'Dev Patel',    designation: 'QA Engineer',     teamLeader: 'Meera Joshi',  department: 'Engineering', date: today, submitted: true  },
      { serial: 5, employeeName: 'Esha Khan',    designation: 'Content Writer',  teamLeader: 'Sanjay Mehta', department: 'Marketing',   date: today, submitted: false },
    ];

    const totals = {
      employees: tableRows.length,
      submitted: tableRows.filter((r) => r.submitted).length,
      notSubmitted: tableRows.filter((r) => !r.submitted).length,
    };

    const { html, text } = renderDailyReportEmail({
      reportDate: today,
      recipientName: 'Rohit',
      attachmentFilename,
      totals,
      rows: tableRows,
    });

    const xlsxRows = tableRows.map((r) => ({
      serial: r.serial,
      employeeName: r.employeeName,
      designation: r.designation,
      department: r.department,
      teamLeader: r.teamLeader,
      date: r.date,
      reportType: r.submitted ? 'daily' : null,
      weeklyObjective: r.submitted ? 'Sample weekly objective for testing' : null,
      description: r.submitted
        ? `Worked on ${r.department.toLowerCase()} tasks today. Made progress on assigned items and unblocked one teammate.`
        : null,
      approvalStatus: r.submitted ? 'pending' : 'not submitted',
      reviewer: null,
      reviewedAt: null,
    }));

    const xlsxBuffer = await buildDailyReportXlsx({ reportDate: today, rows: xlsxRows });

    return {
      subject: `[TaskFlow] Daily Employee Report — ${today} (TEST)`,
      html,
      text,
      attachments: [
        {
          filename: attachmentFilename,
          content: xlsxBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      ],
    };
  },
};

function listTemplates(): string {
  return Object.keys(TEMPLATES)
    .map((k) => `  - ${k}`)
    .join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('[SMTP test] host:', env.SMTP_HOST, 'port:', env.SMTP_PORT, 'secure:', env.SMTP_SECURE);
  console.log('[SMTP test] from:', env.SMTP_FROM);

  const ok = await verifyTransporter();
  console.log('[SMTP test] verify():', ok);
  if (!ok) {
    console.error('[SMTP test] Transporter verification failed — check SMTP_HOST / SMTP_USER / SMTP_PASS in .env.');
    process.exit(1);
  }

  if (args['verify-only']) {
    console.log('[SMTP test] Verify-only mode: credentials look good. Not sending.');
    return;
  }

  const to = splitList(args.to);
  if (!to || to.length === 0) {
    console.error('[SMTP test] Missing --to <email>. Example:');
    console.error('  npm run test:smtp -- --to someone@example.com');
    console.error('Available built-in templates (--template <name>):');
    console.error(listTemplates());
    process.exit(1);
  }

  let subject = typeof args.subject === 'string' ? args.subject : '';
  let html = '';
  let templateText: string | undefined;
  let templateAttachments: MailAttachment[] | undefined;

  if (typeof args['html-file'] === 'string') {
    const filePath = path.resolve(process.cwd(), args['html-file']);
    if (!fs.existsSync(filePath)) {
      console.error(`[SMTP test] --html-file not found: ${filePath}`);
      process.exit(1);
    }
    html = fs.readFileSync(filePath, 'utf8');
  } else if (typeof args.html === 'string') {
    html = args.html;
  } else if (typeof args.template === 'string') {
    const tpl = TEMPLATES[args.template];
    if (!tpl) {
      console.error(`[SMTP test] Unknown template: "${args.template}". Available:`);
      console.error(listTemplates());
      process.exit(1);
    }
    const rendered = await tpl();
    html = rendered.html;
    if (!subject) subject = rendered.subject;
    templateText = rendered.text;
    templateAttachments = rendered.attachments;
  } else {
    // Default: plain-test template.
    const rendered = await TEMPLATES['plain-test']();
    html = rendered.html;
    if (!subject) subject = rendered.subject;
    templateText = rendered.text;
    templateAttachments = rendered.attachments;
  }

  if (args.layout && !args.template) {
    html = renderLayout({
      title: typeof args.title === 'string' ? args.title : 'TaskFlow email',
      intro: typeof args.intro === 'string' ? args.intro : undefined,
      bodyHtml: html,
    });
  }

  if (!subject) subject = `TaskFlow test — ${new Date().toISOString()}`;
  const text =
    typeof args.text === 'string' ? args.text : templateText ?? stripHtml(html);
  const replyTo = typeof args['reply-to'] === 'string' ? args['reply-to'] : undefined;

  console.log('[SMTP test] to:', to.join(', '));
  if (args.cc) console.log('[SMTP test] cc:', args.cc);
  if (args.bcc) console.log('[SMTP test] bcc:', args.bcc);
  console.log('[SMTP test] subject:', subject);
  console.log('[SMTP test] html length:', html.length, 'chars');
  if (templateAttachments?.length) {
    console.log(
      '[SMTP test] attachments:',
      templateAttachments.map((a) => `${a.filename} (${(a.content as Buffer).length ?? 0} bytes)`).join(', ')
    );
  }

  const result = await mailService.send({
    to,
    cc: splitList(args.cc),
    bcc: splitList(args.bcc),
    subject,
    html,
    text,
    replyTo,
    attachments: templateAttachments,
  });

  console.log('[SMTP test] sendMail result:', result);
  if (result.rejected && result.rejected.length > 0) {
    console.error('[SMTP test] Some recipients rejected:', result.rejected);
    process.exit(2);
  }
  console.log('[SMTP test] OK — email accepted for:', result.accepted);
}

main().catch((err) => {
  console.error('[SMTP test] FAILED:', err);
  process.exit(1);
});
