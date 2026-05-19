import ExcelJS from 'exceljs';

export interface WeeklyReportXlsxRow {
  serial: number;
  employeeName: string;
  designation: string | null;
  department: string | null;
  teamLeader: string | null;
  weekRange: string;
  weeklyObjective: string | null;
  description: string | null;
  approvalStatus: string;
  reviewer: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
}

export async function buildWeeklyReportXlsx(params: {
  weekRange: string;
  rows: WeeklyReportXlsxRow[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TaskFlow';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Weekly Report');

  const columns: { header: string; key: keyof WeeklyReportXlsxRow; width: number }[] = [
    { header: 'Sr. No.', key: 'serial', width: 8 },
    { header: 'Employee Name', key: 'employeeName', width: 26 },
    { header: 'Designation', key: 'designation', width: 22 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Team Leader', key: 'teamLeader', width: 22 },
    { header: 'Week', key: 'weekRange', width: 24 },
    { header: 'Weekly Objective', key: 'weeklyObjective', width: 40 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Approval Status', key: 'approvalStatus', width: 16 },
    { header: 'Reviewer', key: 'reviewer', width: 22 },
    { header: 'Reviewed At', key: 'reviewedAt', width: 20 },
    { header: 'Submitted At', key: 'submittedAt', width: 20 },
  ];

  columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
  });

  const headerRow = sheet.getRow(1);
  columns.forEach((col, idx) => {
    headerRow.getCell(idx + 1).value = col.header;
  });

  params.rows.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(2 + rowIdx);
    columns.forEach((col, idx) => {
      const raw = row[col.key];
      excelRow.getCell(idx + 1).value = raw === null || raw === undefined ? '' : raw;
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
