import { escapeHtml, renderLayout } from './layout';

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

function formatStatusBadge(submitted: boolean): string {
  if (submitted) {
    return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:#dcfce7;color:#166534;letter-spacing:0.02em;">SUBMITTED</span>`;
  }
  return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:#fee2e2;color:#991b1b;letter-spacing:0.02em;">PENDING</span>`;
}

function renderStatCard(label: string, value: number, accent: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:14px 18px;min-width:120px;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">${escapeHtml(label)}</div>
        <div style="margin-top:4px;font-size:22px;font-weight:700;color:${accent};line-height:1;">${value}</div>
      </td>
    </tr>
  </table>`;
}

export function renderDailyReportEmail(data: DailyReportEmailData): { html: string; text: string } {
  const rowsHtml = data.rows.length
    ? data.rows
        .map((row, idx) => {
          const zebra = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
          return `<tr style="background:${zebra};">
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;text-align:center;width:48px;">${row.serial}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#0f172a;font-weight:500;">${escapeHtml(row.employeeName)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${escapeHtml(row.designation ?? '—')}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${escapeHtml(row.teamLeader ?? '—')}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;white-space:nowrap;">${escapeHtml(row.date)}</td>
            <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${formatStatusBadge(row.submitted)}</td>
          </tr>`;
        })
        .join('')
    : `<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8;font-size:13px;">No employees found for this report.</td></tr>`;

  const bodyHtml = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">
      <tr>
        <td style="padding-right:8px;">${renderStatCard('Total employees', data.totals.employees, '#0f172a')}</td>
        <td style="padding:0 8px;">${renderStatCard('Submitted', data.totals.submitted, '#16a34a')}</td>
        <td style="padding-left:8px;">${renderStatCard('Pending', data.totals.notSubmitted, '#dc2626')}</td>
      </tr>
    </table>

    <div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:10px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#0f172a;">
            <th align="center" style="padding:12px;font-size:11px;font-weight:600;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.06em;width:48px;">Sr. No.</th>
            <th align="left" style="padding:12px;font-size:11px;font-weight:600;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Employee</th>
            <th align="left" style="padding:12px;font-size:11px;font-weight:600;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Designation</th>
            <th align="left" style="padding:12px;font-size:11px;font-weight:600;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Team Leader</th>
            <th align="left" style="padding:12px;font-size:11px;font-weight:600;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Date</th>
            <th align="center" style="padding:12px;font-size:11px;font-weight:600;color:#e2e8f0;text-transform:uppercase;letter-spacing:0.06em;">Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>

    <div style="margin-top:20px;padding:14px 16px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;">
      <div style="font-size:13px;color:#3730a3;font-weight:600;margin-bottom:4px;">📎 Attachment</div>
      <div style="font-size:13px;color:#475569;line-height:1.5;">
        A detailed XLSX report (<strong>${escapeHtml(data.attachmentFilename)}</strong>) is attached with each employee's full daily report data, including descriptions, approval status, and reviewer notes.
      </div>
    </div>
  `;

  const greeting = data.recipientName ? `Hello ${data.recipientName},` : 'Hello,';

  const html = renderLayout({
    title: `Daily Employee Report — ${data.reportDate}`,
    preheader: `${data.totals.submitted} of ${data.totals.employees} employees submitted reports today.`,
    intro: `${greeting} Here is the daily employee report summary for ${data.reportDate}. The full per-employee report is attached as an Excel file.`,
    bodyHtml,
    footerNote: 'You are receiving this because you are an Admin or Super Admin in TaskFlow.',
  });

  const textRows = data.rows
    .map((r) => `${r.serial}. ${r.employeeName} | ${r.designation ?? '-'} | TL: ${r.teamLeader ?? '-'} | ${r.date} | ${r.submitted ? 'SUBMITTED' : 'PENDING'}`)
    .join('\n');

  const text = `Daily Employee Report — ${data.reportDate}

${greeting}

Summary:
- Total employees: ${data.totals.employees}
- Submitted: ${data.totals.submitted}
- Pending: ${data.totals.notSubmitted}

${textRows}

A detailed XLSX report (${data.attachmentFilename}) is attached.

— TaskFlow`;

  return { html, text };
}
