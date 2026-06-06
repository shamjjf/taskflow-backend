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

export interface DailyReportJobOrgResult {
  organizationId: number;
  organizationSlug: string;
  organizationName: string;
  reportDate: string;
  recipients: string[];
  rowCount: number;
  submittedCount: number;
  messageId?: string;
  skippedReason?: string;
}

export interface DailyReportJobResult {
  reportDate: string;
  perOrg: DailyReportJobOrgResult[];
}

/**
 * Builds and sends the daily employee report email for ONE organization.
 * Each org gets its own email with its own subject, recipients, and data —
 * so a JJF admin never sees 1xl employees and vice versa.
 */
async function runForOrganization(
  org: { id: number; slug: string; name: string },
  referenceDate: Date
): Promise<DailyReportJobOrgResult> {
  const organizationId = org.id;
  const dayStart = startOfDay(referenceDate);
  const dayEnd = endOfDay(referenceDate);
  const reportDate = formatDate(referenceDate);

  // 1. Recipients: every active admin + super_admin of this org with an
  //    email, plus any additional addresses configured for this org from
  //    Settings. Each org has its own recipient list.
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
      reportDate,
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

  // 3. Today's daily reports for this org, keyed by userId
  const todaysReports = await prisma.report.findMany({
    where: {
      organizationId,
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

  // Filename + subject are namespaced by org slug so concurrent runs for
  // different orgs don't overwrite each other on disk and don't share
  // subject lines in recipients' inboxes.
  const attachmentFilename = `taskflow-${org.slug}-daily-report-${reportDate}.xlsx`;

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

  // 7. Send (BCC so recipients don't see each other). Subject carries the
  // org's display name so the recipient knows which tenant this is for.
  const result = await mailService.send({
    to: recipients[0],
    bcc: recipients.slice(1),
    subject: `[${org.name}] Daily Employee Report — ${reportDate}`,
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
    reportDate,
    recipients,
    rowCount: tableRows.length,
    submittedCount,
    messageId: result.messageId,
  };
}

/**
 * Runs the daily report job across every active organization. Each org
 * receives its own email with its own data — there is no cross-org mixing.
 * Idempotent — safe to invoke manually for testing.
 */
export async function runDailyReportJob(
  referenceDate: Date = new Date()
): Promise<DailyReportJobResult> {
  const orgs = await prisma.organization.findMany({
    where: { status: 'active' },
    select: { id: true, slug: true, name: true },
  });

  const perOrg: DailyReportJobOrgResult[] = [];
  for (const org of orgs) {
    try {
      const result = await runForOrganization(org, referenceDate);
      perOrg.push(result);
    } catch (err) {
      // Don't let one org's failure cancel the others — log and continue.
      console.error(`[dailyReportJob] org=${org.slug} failed:`, err);
      perOrg.push({
        organizationId: org.id,
        organizationSlug: org.slug,
        organizationName: org.name,
        reportDate: formatDate(referenceDate),
        recipients: [],
        rowCount: 0,
        submittedCount: 0,
        skippedReason: `Job failed: ${(err as Error).message}`,
      });
    }
  }

  return {
    reportDate: formatDate(referenceDate),
    perOrg,
  };
}
