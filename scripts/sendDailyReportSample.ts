import { prisma } from '@/config/prisma';
import { mailService } from '@/modules/mail/mail.service';
import { renderDailyReportEmail, DailyReportRow } from '@/modules/mail/templates/dailyReport.template';
import { buildDailyReportXlsx, DailyReportXlsxRow } from '@/modules/reports/dailyReportXlsx';
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

async function main() {
  const referenceDate = new Date();
  const dayStart = startOfDay(referenceDate);
  const dayEnd = endOfDay(referenceDate);
  const reportDate = formatDate(referenceDate);

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

  const todaysReports = await prisma.report.findMany({
    where: {
      reportType: 'daily',
      reportDate: { gte: dayStart, lte: dayEnd },
      user: { role: 'employee' },
    },
    include: { reviewedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const reportByUser = new Map<number, (typeof todaysReports)[number]>();
  for (const r of todaysReports) {
    if (!reportByUser.has(r.userId)) reportByUser.set(r.userId, r);
  }

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

  const xlsxBuffer = await buildDailyReportXlsx({ reportDate, rows: xlsxRows });
  const savedFilename = saveReportFile(attachmentFilename, xlsxBuffer);
  const viewReportUrl = buildSignedReportUrl(savedFilename);

  const { html, text } = renderDailyReportEmail({
    reportDate,
    rows: tableRows,
    attachmentFilename,
    viewReportUrl,
    totals,
  });

  console.log(`Sending sample daily report to ${SAMPLE_RECIPIENT} ...`);
  console.log(`  Date:       ${reportDate}`);
  console.log(`  Employees:  ${totals.employees}`);
  console.log(`  Submitted:  ${totals.submitted}`);
  console.log(`  Pending:    ${totals.notSubmitted}`);
  console.log(`  View URL:   ${viewReportUrl}`);

  const result = await mailService.send({
    to: SAMPLE_RECIPIENT,
    subject: `[TaskFlow] [SAMPLE] Daily Employee Report — ${reportDate}`,
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
    console.error('✗ Failed to send sample daily report:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
