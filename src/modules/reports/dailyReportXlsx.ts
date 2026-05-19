import ExcelJS from 'exceljs';

export interface DailyReportXlsxRow {
  serial: number;
  employeeName: string;
  designation: string | null;
  department: string | null;
  teamLeader: string | null;
  date: string;
  reportType: string | null;
  description: string | null;
  approvalStatus: string;
  reviewer: string | null;
  reviewedAt: string | null;
}

export async function buildDailyReportXlsx(params: {
  reportDate: string;
  rows: DailyReportXlsxRow[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TaskFlow';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Daily Report');

  const columns: { header: string; key: keyof DailyReportXlsxRow; width: number }[] = [
    { header: 'Sr. No.', key: 'serial', width: 8 },
    { header: 'Employee Name', key: 'employeeName', width: 26 },
    { header: 'Designation', key: 'designation', width: 22 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Team Leader', key: 'teamLeader', width: 22 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Report Type', key: 'reportType', width: 13 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Approval Status', key: 'approvalStatus', width: 16 },
    { header: 'Reviewer', key: 'reviewer', width: 22 },
    { header: 'Reviewed At', key: 'reviewedAt', width: 20 },
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
