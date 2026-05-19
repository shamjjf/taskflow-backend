import { prisma } from '@/config/prisma';
import { mailService } from '@/modules/mail/mail.service';
import { renderWeeklyReportEmail, WeeklyReportRow } from '@/modules/mail/templates/weeklyReport.template';
import { buildWeeklyReportXlsx, WeeklyReportXlsxRow } from '@/modules/reports/weeklyReportXlsx';
import { saveReportFile, buildSignedReportUrl } from '@/modules/reports/reportFiles';

const SAMPLE_RECIPIENT = 'rohit@jjfindia.com';

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

function getWeekRange(referenceDate: Date): { weekStart: Date; weekEnd: Date } {
  const day = referenceDate.getDay();
  const sunday = new Date(referenceDate);
  sunday.setDate(referenceDate.getDate() - day);
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { weekStart: startOfDay(sunday), weekEnd: endOfDay(saturday) };
}

async function main() {
  const referenceDate = new Date();
  const { weekStart, weekEnd } = getWeekRange(referenceDate);
  const weekStartStr = formatDate(weekStart);
  const weekEndStr = formatDate(weekEnd);

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

  const weeklyReports = await prisma.report.findMany({
    where: {
      reportType: 'weekly',
      reportDate: { gte: weekStart, lte: weekEnd },
      user: { role: 'employee' },
    },
    include: { reviewedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const reportByUser = new Map<number, (typeof weeklyReports)[number]>();
  for (const r of weeklyReports) {
    if (!reportByUser.has(r.userId)) reportByUser.set(r.userId, r);
  }

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

  const xlsxBuffer = await buildWeeklyReportXlsx({ weekRange: weekRangeLabel, rows: xlsxRows });
  const savedFilename = saveReportFile(attachmentFilename, xlsxBuffer);
  const viewReportUrl = buildSignedReportUrl(savedFilename);

  const { html, text } = renderWeeklyReportEmail({
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    rows: tableRows,
    attachmentFilename,
    viewReportUrl,
    totals,
  });

  console.log(`Sending sample weekly report to ${SAMPLE_RECIPIENT} ...`);
  console.log(`  Week:       ${weekStartStr} → ${weekEndStr}`);
  console.log(`  Employees:  ${totals.employees}`);
  console.log(`  Submitted:  ${totals.submitted}`);
  console.log(`  Pending:    ${totals.notSubmitted}`);
  console.log(`  View URL:   ${viewReportUrl}`);

  const result = await mailService.send({
    to: SAMPLE_RECIPIENT,
    subject: `[TaskFlow] [SAMPLE] Weekly Employee Report — ${weekStartStr} to ${weekEndStr}`,
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

  console.log('✓ Sent.');
  console.log(`  messageId: ${result.messageId}`);
  console.log(`  accepted:  ${result.accepted.join(', ')}`);
  if (result.rejected.length) console.log(`  rejected:  ${result.rejected.join(', ')}`);
}

main()
  .catch((err) => {
    console.error('✗ Failed to send sample weekly report:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
