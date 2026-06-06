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

export interface WeeklyReportJobOrgResult {
  organizationId: number;
  organizationSlug: string;
  organizationName: string;
  weekStart: string;
  weekEnd: string;
  recipients: string[];
  rowCount: number;
  submittedCount: number;
  messageId?: string;
  skippedReason?: string;
}

export interface WeeklyReportJobResult {
  weekStart: string;
  weekEnd: string;
  perOrg: WeeklyReportJobOrgResult[];
}

/**
 * Builds and sends the weekly employee report email for ONE organization.
 * Each org gets its own email with its own data, recipients and subject.
 */
async function runForOrganization(
  org: { id: number; slug: string; name: string },
  referenceDate: Date
): Promise<WeeklyReportJobOrgResult> {
  const organizationId = org.id;
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const weekStartStr = formatDate(weekStart);
  const weekEndStr = formatDate(weekEnd);

  // 1. Recipients: every active admin + super_admin OF THIS ORG with an
  //    email, plus any additional addresses configured for this org.
  const [recipientUsers, extraEmails] = await Promise.all([
    prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ['admin', 'super_admin'] },
        status: 'active',
      },
      select: { id: true, name: true, email: true, role: true },
    }),
    reportRecipientsService.listEmails(organizationId),
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
      organizationId,
      organizationSlug: org.slug,
      organizationName: org.name,
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      recipients: [],
      rowCount: 0,
      submittedCount: 0,
      skippedReason: 'No active admin / super_admin recipients found for this organization',
    };
  }

  // 2. All active employees in this org, with department + team leader
  const employees = await prisma.user.findMany({
    where: { organizationId, role: 'employee', status: 'active' },
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

  // 3. This week's weekly reports for this org, keyed by userId (latest per user)
  const weeklyReports = await prisma.report.findMany({
    where: {
      organizationId,
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

  // Per-org filename so concurrent runs for different tenants don't collide
  const attachmentFilename = `taskflow-${org.slug}-weekly-report-${weekStartStr}_to_${weekEndStr}.xlsx`;

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

  // 7. Send (BCC so recipients don't see each other). Subject carries the
  // org's display name so the recipient knows which tenant this is for.
  const result = await mailService.send({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject: `[${org.name}] Weekly Employee Report — ${weekStartStr} to ${weekEndStr}`,
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
    organizationId,
    organizationSlug: org.slug,
    organizationName: org.name,
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    recipients,
    rowCount: tableRows.length,
    submittedCount,
    messageId: result.messageId,
  };
}

/**
 * Runs the weekly report job across every active organization. Each org
 * receives its own email with its own data — JJF and 1xl never mix.
 * Idempotent — safe to invoke manually for testing.
 */
export async function runWeeklyReportJob(
  referenceDate: Date = new Date()
): Promise<WeeklyReportJobResult> {
  const orgs = await prisma.organization.findMany({
    where: { status: 'active' },
    select: { id: true, slug: true, name: true },
  });

  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const weekStartStr = formatDate(weekStart);
  const weekEndStr = formatDate(weekEnd);

  const perOrg: WeeklyReportJobOrgResult[] = [];
  for (const org of orgs) {
    try {
      const result = await runForOrganization(org, referenceDate);
      perOrg.push(result);
    } catch (err) {
      // One org's failure shouldn't block other orgs' emails — log & continue.
      console.error(`[weeklyReportJob] org=${org.slug} failed:`, err);
      perOrg.push({
        organizationId: org.id,
        organizationSlug: org.slug,
        organizationName: org.name,
        weekStart: weekStartStr,
        weekEnd: weekEndStr,
        recipients: [],
        rowCount: 0,
        submittedCount: 0,
        skippedReason: `Job failed: ${(err as Error).message}`,
      });
    }
  }

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    perOrg,
  };
}
