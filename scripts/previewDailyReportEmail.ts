import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { renderDailyReportEmail, DailyReportRow } from '@/modules/mail/templates/dailyReport.template';

const rows: DailyReportRow[] = [
  { serial: 1,  employeeName: 'Aarav Sharma',     designation: 'Frontend Developer',  teamLeader: 'Neha Verma',     department: 'Engineering',  date: '2026-05-18', submitted: true  },
  { serial: 2,  employeeName: 'Priya Patel',      designation: 'Backend Developer',   teamLeader: 'Neha Verma',     department: 'Engineering',  date: '2026-05-18', submitted: true  },
  { serial: 3,  employeeName: 'Rohan Mehta',      designation: 'QA Engineer',         teamLeader: 'Neha Verma',     department: 'Engineering',  date: '2026-05-18', submitted: false },
  { serial: 4,  employeeName: 'Sneha Iyer',       designation: 'UI/UX Designer',      teamLeader: 'Karan Singh',    department: 'Design',       date: '2026-05-18', submitted: true  },
  { serial: 5,  employeeName: 'Vikram Joshi',     designation: 'Graphic Designer',    teamLeader: 'Karan Singh',    department: 'Design',       date: '2026-05-18', submitted: true  },
  { serial: 6,  employeeName: 'Ananya Nair',      designation: 'Content Writer',      teamLeader: 'Riya Kapoor',    department: 'Marketing',    date: '2026-05-18', submitted: false },
  { serial: 7,  employeeName: 'Kabir Khanna',     designation: 'SEO Specialist',      teamLeader: 'Riya Kapoor',    department: 'Marketing',    date: '2026-05-18', submitted: true  },
  { serial: 8,  employeeName: 'Isha Reddy',       designation: 'Social Media Manager',teamLeader: 'Riya Kapoor',    department: 'Marketing',    date: '2026-05-18', submitted: true  },
  { serial: 9,  employeeName: 'Arjun Pillai',     designation: 'Sales Executive',     teamLeader: 'Maya Desai',     department: 'Sales',        date: '2026-05-18', submitted: false },
  { serial: 10, employeeName: 'Tanvi Bhatt',      designation: 'Account Manager',     teamLeader: 'Maya Desai',     department: 'Sales',        date: '2026-05-18', submitted: true  },
  { serial: 11, employeeName: 'Dev Saxena',       designation: 'HR Associate',        teamLeader: null,             department: 'HR',           date: '2026-05-18', submitted: true  },
  { serial: 12, employeeName: 'Meera Rao',        designation: null,                  teamLeader: null,             department: 'HR',           date: '2026-05-18', submitted: false },
];

const submitted = rows.filter(r => r.submitted).length;

const { html } = renderDailyReportEmail({
  reportDate: '2026-05-18',
  rows,
  attachmentFilename: 'taskflow-daily-report-2026-05-18.xlsx',
  totals: {
    employees: rows.length,
    submitted,
    notSubmitted: rows.length - submitted,
  },
});

const out = resolve(__dirname, 'dailyReportEmail.preview.html');
writeFileSync(out, html, 'utf8');
console.log(`Preview written to: ${out}`);
