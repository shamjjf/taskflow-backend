import { prisma } from '@/config/prisma';
import { mailService } from '@/modules/mail/mail.service';
import { renderWeeklyReportEmail, WeeklyReportRow } from '@/modules/mail/templates/weeklyReport.template';
import { buildWeeklyReportXlsx, WeeklyReportXlsxRow } from './weeklyReportXlsx';
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

/**
 * Returns the Sunday→Saturday week boundaries that contain `referenceDate`.
 * (When fired by the Saturday cron, that's the current week ending today.)
 */
function getWeekRange(referenceDate: Date): { weekStart: Date; weekEnd: Date } {
  const day = referenceDate.getDay(); // 0 = Sunday, 6 = Saturday
  const sunday = new Date(referenceDate);
  sunday.setDate(referenceDate.getDate() - day);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { weekStart: startOfDay(sunday), weekEnd: endOfDay(saturday) };
}

export interface WeeklyReportJobResult {
  weekStart: string;
  weekEnd: string;
  recipients: string[];
  rowCount: number;
  submittedCount: number;
  messageId?: string;
  skippedReason?: string;
}

/**
 * Builds and sends the weekly employee report email to all admins and super_admins.
 * Covers the Sunday→Saturday week that contains `referenceDate`.
 */
export async function runWeeklyReportJob(referenceDate: Date = new Date()): Promise<WeeklyReportJobResult> {
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const weekStartStr = formatDate(weekStart);
  const weekEndStr = formatDate(weekEnd);

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
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
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

  // 3. This week's weekly reports, keyed by userId (latest per user)
  const weeklyReports = await prisma.report.findMany({
    where: {
      reportType: 'weekly',
      reportDate: { gte: weekStart, lte: weekEnd },
      user: { role: 'employee' },
    },
    include: {
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const reportByUser = new Map<number, (typeof weeklyReports)[number]>();
  for (const r of weeklyReports) {
    if (!reportByUser.has(r.userId)) {
      reportByUser.set(r.userId, r);
    }
  }

  // 4. Build table rows + xlsx rows
  const tableRows: WeeklyReportRow[] = [];
  const xlsxRows: WeeklyReportXlsxRow[] = [];
  const weekRangeLabel = `${weekStartStr} to ${weekEndStr}`;

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
      submitted: Boolean(report),
    });

    xlsxRows.push({
      serial,
      employeeName: emp.name,
      designation: emp.designation,
      department: departmentName,
      teamLeader: teamLeaderName,
      weekRange: weekRangeLabel,
      weeklyObjective: report?.weeklyObjective ?? null,
      description: report?.description ?? null,
      approvalStatus: report ? report.approvalStatus : 'not submitted',
      reviewer: report?.reviewedBy?.name ?? null,
      reviewedAt: report?.reviewedAt ? report.reviewedAt.toISOString().slice(0, 19).replace('T', ' ') : null,
      submittedAt: report?.createdAt ? report.createdAt.toISOString().slice(0, 19).replace('T', ' ') : null,
    });
  });

  const submittedCount = tableRows.filter((r) => r.submitted).length;
  const totals = {
    employees: tableRows.length,
    submitted: submittedCount,
    notSubmitted: tableRows.length - submittedCount,
  };

  const attachmentFilename = `taskflow-weekly-report-${weekStartStr}_to_${weekEndStr}.xlsx`;

  // 5. Build xlsx, persist to disk, and produce a signed View Report URL
  const xlsxBuffer = await buildWeeklyReportXlsx({ weekRange: weekRangeLabel, rows: xlsxRows });
  const savedFilename = saveReportFile(attachmentFilename, xlsxBuffer);
  const viewReportUrl = buildSignedReportUrl(savedFilename);

  // 6. Render html
  const { html, text } = renderWeeklyReportEmail({
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    rows: tableRows,
    attachmentFilename,
    viewReportUrl,
    totals,
  });

  // 7. Send (BCC so recipients don't see each other)
  const result = await mailService.send({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject: `[TaskFlow] Weekly Employee Report — ${weekStartStr} to ${weekEndStr}`,
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
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    recipients,
    rowCount: tableRows.length,
    submittedCount,
    messageId: result.messageId,
  };
}
