import ExcelJS from 'exceljs';

export interface DailyReportXlsxRow {
  serial: number;
  employeeName: string;
  designation: string | null;
  department: string | null;
  teamLeader: string | null;
  date: string;
  reportType: string | null;
  weeklyObjective: string | null;
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

  const sheet = workbook.addWorksheet('Daily Report', {
    properties: { defaultRowHeight: 20 },
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // Title row
  sheet.mergeCells('A1:L1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `TaskFlow — Daily Employee Report`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  sheet.getRow(1).height = 28;

  sheet.mergeCells('A2:L2');
  const subCell = sheet.getCell('A2');
  subCell.value = `Report date: ${params.reportDate}   •   Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  subCell.font = { size: 11, color: { argb: 'FF64748B' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(2).height = 20;

  // Blank spacer row
  sheet.getRow(3).height = 8;

  const columns: { header: string; key: keyof DailyReportXlsxRow; width: number }[] = [
    { header: 'Sr. No.', key: 'serial', width: 8 },
    { header: 'Employee Name', key: 'employeeName', width: 26 },
    { header: 'Designation', key: 'designation', width: 22 },
    { header: 'Department', key: 'department', width: 20 },
    { header: 'Team Leader', key: 'teamLeader', width: 22 },
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Report Type', key: 'reportType', width: 13 },
    { header: 'Weekly Objective', key: 'weeklyObjective', width: 30 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Approval Status', key: 'approvalStatus', width: 16 },
    { header: 'Reviewer', key: 'reviewer', width: 22 },
    { header: 'Reviewed At', key: 'reviewedAt', width: 20 },
  ];

  // Set widths
  columns.forEach((col, idx) => {
    sheet.getColumn(idx + 1).width = col.width;
  });

  // Header row at row 4
  const headerRow = sheet.getRow(4);
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  headerRow.height = 26;

  // Data rows
  params.rows.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(5 + rowIdx);
    columns.forEach((col, idx) => {
      const cell = excelRow.getCell(idx + 1);
      const raw = row[col.key];
      cell.value = raw === null || raw === undefined ? '' : raw;
      cell.alignment = {
        vertical: 'top',
        horizontal: col.key === 'serial' ? 'center' : 'left',
        wrapText: true,
      };
      cell.font = { size: 10, color: { argb: 'FF0F172A' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (rowIdx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }

      if (col.key === 'approvalStatus') {
        const status = String(raw ?? '').toLowerCase();
        let fg = 'FF475569';
        let bg = 'FFF1F5F9';
        if (status === 'approved') {
          fg = 'FF166534';
          bg = 'FFDCFCE7';
        } else if (status === 'rejected') {
          fg = 'FF991B1B';
          bg = 'FFFEE2E2';
        } else if (status === 'pending') {
          fg = 'FF92400E';
          bg = 'FFFEF3C7';
        } else if (status === 'not submitted') {
          fg = 'FF7F1D1D';
          bg = 'FFFECACA';
        }
        cell.font = { size: 10, bold: true, color: { argb: fg } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    });
    excelRow.height = 36;
  });

  // Auto-filter on the header row
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
