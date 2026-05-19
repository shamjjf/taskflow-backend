import { env } from '@/config/env';
import { escapeHtml } from './layout';

export interface DailyReportRow {
  serial: number;
  employeeName: string;
  designation: string | null;
  teamLeader: string | null;
  department: string | null;
  date: string;
  submitted: boolean;
}

export interface DailyReportEmailData {
  reportDate: string;
  recipientName?: string;
  rows: DailyReportRow[];
  attachmentFilename: string;
  totals: {
    employees: number;
    submitted: number;
    notSubmitted: number;
  };
}

function formatReportDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function statusText(submitted: boolean): string {
  const color = submitted ? '#16a34a' : '#dc2626';
  const label = submitted ? 'Submitted' : 'Pending';
  return `<span style="color:${color};font-weight:600;">${label}</span>`;
}

export function renderDailyReportEmail(data: DailyReportEmailData): { html: string; text: string } {
  const appName = escapeHtml(env.APP_NAME);
  const appUrl = escapeHtml(env.APP_URL);
  const prettyDate = escapeHtml(formatReportDate(data.reportDate));
  const greetingName = data.recipientName ? escapeHtml(data.recipientName) : 'Team';

  const rowsHtml = data.rows.length
    ? data.rows
        .map(
          (row) => `<tr>
            <td style="border:1px solid #cccccc;padding:6px 10px;text-align:center;">${row.serial}</td>
            <td style="border:1px solid #cccccc;padding:6px 10px;">${escapeHtml(row.employeeName)}</td>
            <td style="border:1px solid #cccccc;padding:6px 10px;">${escapeHtml(row.department ?? '—')}</td>
            <td style="border:1px solid #cccccc;padding:6px 10px;">${escapeHtml(row.designation ?? '—')}</td>
            <td style="border:1px solid #cccccc;padding:6px 10px;">${escapeHtml(row.teamLeader ?? '—')}</td>
            <td style="border:1px solid #cccccc;padding:6px 10px;text-align:center;">${statusText(row.submitted)}</td>
          </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" style="border:1px solid #cccccc;padding:12px;text-align:center;color:#666666;">No employees found for this report.</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Daily Employee Report — ${prettyDate}</title>
  </head>
  <body style="margin:0;padding:20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#000000;font-size:14px;line-height:1.5;">
    <p style="margin:0 0 14px;">Dear ${greetingName},</p>

    <p style="margin:0 0 14px;font-weight:bold;">
      Please find the below-mentioned daily report status for the date ${prettyDate}
    </p>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
      <tr>
        <td style="border:1px solid #cccccc;padding:8px 12px;width:33%;">
          <span style="color:#000000;font-weight:bold;">Total Employees - ${data.totals.employees}</span>
        </td>
        <td style="border:1px solid #cccccc;padding:8px 12px;width:33%;">
          <span style="color:#16a34a;font-weight:bold;">Submitted - ${data.totals.submitted}</span>
        </td>
        <td style="border:1px solid #cccccc;padding:8px 12px;width:34%;">
          <span style="color:#dc2626;font-weight:bold;">Pending - ${data.totals.notSubmitted}</span>
        </td>
      </tr>
    </table>

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 16px;">
      <thead>
        <tr style="background:#f2f2f2;">
          <th style="border:1px solid #cccccc;padding:8px 10px;text-align:center;font-weight:bold;width:50px;">Sr.No</th>
          <th style="border:1px solid #cccccc;padding:8px 10px;text-align:left;font-weight:bold;">Name</th>
          <th style="border:1px solid #cccccc;padding:8px 10px;text-align:left;font-weight:bold;">Department</th>
          <th style="border:1px solid #cccccc;padding:8px 10px;text-align:left;font-weight:bold;">Designation</th>
          <th style="border:1px solid #cccccc;padding:8px 10px;text-align:left;font-weight:bold;">Reporting Manager</th>
          <th style="border:1px solid #cccccc;padding:8px 10px;text-align:center;font-weight:bold;">Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <p style="margin:0 0 14px;">
      A detailed XLSX report (<strong>${escapeHtml(data.attachmentFilename)}</strong>) is attached with each employee's full daily report data.
    </p>

    <p style="margin:0 0 4px;">Regards,</p>
    <p style="margin:0 0 18px;">${appName} Team</p>

    <hr style="border:none;border-top:1px solid #cccccc;margin:18px 0;" />
    <p style="margin:0;color:#666666;font-size:12px;">
      This is an automated message from <a href="${appUrl}" style="color:#666666;">${appName}</a>. Please do not reply.
      You are receiving this because you are an Admin or Super Admin in ${appName}.
    </p>
  </body>
</html>`;

  const textRows = data.rows
    .map(
      (r) =>
        `${r.serial}. ${r.employeeName} | ${r.department ?? '-'} | ${r.designation ?? '-'} | TL: ${r.teamLeader ?? '-'} | ${r.submitted ? 'Submitted' : 'Pending'}`,
    )
    .join('\n');

  const text = `Dear ${data.recipientName ?? 'Team'},

Please find the below-mentioned daily report status for the date ${formatReportDate(data.reportDate)}

Total Employees - ${data.totals.employees}
Submitted - ${data.totals.submitted}
Pending - ${data.totals.notSubmitted}

${textRows}

A detailed XLSX report (${data.attachmentFilename}) is attached.

Regards,
${env.APP_NAME} Team`;

  return { html, text };
}
