import { prisma } from '@/config/prisma';
import { mailService } from '@/modules/mail/mail.service';
import { renderDailyReportEmail, DailyReportRow } from '@/modules/mail/templates/dailyReport.template';
import { buildDailyReportXlsx, DailyReportXlsxRow } from './dailyReportXlsx';
import { saveReportFile, buildSignedReportUrl } from './reportFiles';
import { reportRecipientsService } from '@/modules/settings/reportRecipients.service';

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export interface DailyReportJobResult {
  reportDate: string;
  recipients: string[];
  rowCount: number;
  submittedCount: number;
  messageId?: string;
  skippedReason?: string;
}

/**
 * Builds and sends the daily employee report email to all admins and super_admins.
 * Idempotent — safe to invoke manually for testing.
 */
export async function runDailyReportJob(referenceDate: Date = new Date()): Promise<DailyReportJobResult> {
  const dayStart = startOfDay(referenceDate);
  const dayEnd = endOfDay(referenceDate);
  const reportDate = formatDate(referenceDate);

  // 1. Recipients: every active admin + super_admin with an email, plus any
  //    additional addresses configured by the Super Admin from Settings.
  const [recipientUsers, extraEmails] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: { in: ['admin', 'super_admin'] },
        status: 'active',
      },
      select: { id: true, name: true, email: true, role: true },
    }),
    reportRecipientsService.listEmails(),
  ]);

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const email of [...recipientUsers.map((u) => u.email), ...extraEmails]) {
    if (!email) continue;
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    recipients.push(email);
  }

  if (recipients.length === 0) {
    return {
      reportDate,
      recipients: [],
      rowCount: 0,
      submittedCount: 0,
      skippedReason: 'No active admin / super_admin recipients found',
    };
  }

  // 2. All active employees, with department + team leader
  const employees = await prisma.user.findMany({
    where: { role: 'employee', status: 'active' },
    include: {
      department: {
        select: {
          id: true,
          name: true,
          teamLeader: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
  });

  // 3. Today's daily reports, keyed by userId
  const todaysReports = await prisma.report.findMany({
    where: {
      reportType: 'daily',
      reportDate: { gte: dayStart, lte: dayEnd },
      user: { role: 'employee' },
    },
    include: {
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Pick the latest report per user (already ordered desc by createdAt)
  const reportByUser = new Map<number, (typeof todaysReports)[number]>();
  for (const r of todaysReports) {
    if (!reportByUser.has(r.userId)) {
      reportByUser.set(r.userId, r);
    }
  }

  // 4. Build table rows + xlsx rows
  const tableRows: DailyReportRow[] = [];
  const xlsxRows: DailyReportXlsxRow[] = [];

  employees.forEach((emp, idx) => {
    const serial = idx + 1;
    const report = reportByUser.get(emp.id);
    const teamLeaderName = emp.department?.teamLeader?.name ?? null;
    const departmentName = emp.department?.name ?? null;

    tableRows.push({
      serial,
      employeeName: emp.name,
      designation: emp.designation,
      teamLeader: teamLeaderName,
      department: departmentName,
      date: reportDate,
      submitted: Boolean(report),
    });

    xlsxRows.push({
      serial,
      employeeName: emp.name,
      designation: emp.designation,
      department: departmentName,
      teamLeader: teamLeaderName,
      date: reportDate,
      reportType: report?.reportType ?? null,
      description: report?.description ?? null,
      approvalStatus: report ? report.approvalStatus : 'not submitted',
      reviewer: report?.reviewedBy?.name ?? null,
      reviewedAt: report?.reviewedAt ? report.reviewedAt.toISOString().slice(0, 19).replace('T', ' ') : null,
    });
  });

  const submittedCount = tableRows.filter((r) => r.submitted).length;
  const totals = {
    employees: tableRows.length,
    submitted: submittedCount,
    notSubmitted: tableRows.length - submittedCount,
  };

  const attachmentFilename = `taskflow-daily-report-${reportDate}.xlsx`;

  // 5. Build xlsx, persist to disk, and produce a signed View Report URL
  const xlsxBuffer = await buildDailyReportXlsx({ reportDate, rows: xlsxRows });
  const savedFilename = saveReportFile(attachmentFilename, xlsxBuffer);
  const viewReportUrl = buildSignedReportUrl(savedFilename);

  // 6. Render html
  const { html, text } = renderDailyReportEmail({
    reportDate,
    rows: tableRows,
    attachmentFilename,
    viewReportUrl,
    totals,
  });

  // 7. Send (BCC so recipients don't see each other)
  const result = await mailService.send({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject: `[TaskFlow] Daily Employee Report — ${reportDate}`,
    html,
    text,
    attachments: [
      {
        filename: attachmentFilename,
        content: xlsxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ],
  });

  return {
    reportDate,
    recipients,
    rowCount: tableRows.length,
    submittedCount,
    messageId: result.messageId,
  };
}
