import { PrismaClient, TaskPriority, TaskStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Clean existing data
  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversationParticipant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.report.deleteMany();
  await prisma.taskComment.deleteMany();
  await prisma.taskAttachment.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.task.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  console.log('✓ Cleaned existing data');

  // ============ DEPARTMENTS ============
  const departments = await Promise.all([
    prisma.department.create({ data: { name: 'Development', description: 'Engineering & software development' } }),
    prisma.department.create({ data: { name: 'Social Media', description: 'Social media marketing & community' } }),
    prisma.department.create({ data: { name: 'Graphic Design', description: 'Visual design & creative assets' } }),
    prisma.department.create({ data: { name: 'Admin', description: 'Office administration & operations' } }),
    prisma.department.create({ data: { name: 'HR', description: 'Human resources & recruitment' } }),
    prisma.department.create({ data: { name: 'Content Writer', description: 'Blog posts, articles, copywriting' } }),
    prisma.department.create({ data: { name: 'Outreach', description: 'Business development & outreach' } }),
  ]);
  console.log(`✓ Created ${departments.length} departments`);

  const deptMap = Object.fromEntries(departments.map((d) => [d.name, d.id]));

  // ============ USERS ============
  const defaultPassword = await bcrypt.hash('password', 10);

  // Super Admin
  const superAdmin = await prisma.user.create({
    data: {
      name: 'Rahul Kapoor',
      email: 'admin@taskflow.com',
      passwordHash: defaultPassword,
      role: 'super_admin',
      designation: 'Founder & CEO',
      status: 'active',
    },
  });

  // Team Leaders
  const teamLeaders = await Promise.all([
    prisma.user.create({ data: { name: 'Arjun Khanna', email: 'arjun@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['Development'], designation: 'Engineering Lead' } }),
    prisma.user.create({ data: { name: 'Priya Sharma', email: 'priya@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['Content Writer'], designation: 'Content Lead' } }),
    prisma.user.create({ data: { name: 'Neha Mehta', email: 'neha@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['Graphic Design'], designation: 'Design Lead' } }),
    prisma.user.create({ data: { name: 'Kavya Iyer', email: 'kavya@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['Social Media'], designation: 'Social Media Lead' } }),
    prisma.user.create({ data: { name: 'Rohan Verma', email: 'rohan@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['Outreach'], designation: 'Outreach Lead' } }),
    prisma.user.create({ data: { name: 'Meera Joshi', email: 'meera@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['HR'], designation: 'HR Lead' } }),
    prisma.user.create({ data: { name: 'Vikram Singh', email: 'vikram@acme.com', passwordHash: defaultPassword, role: 'team_leader', departmentId: deptMap['Admin'], designation: 'Admin Lead' } }),
  ]);

  // Assign TLs to departments
  await prisma.department.update({ where: { id: deptMap['Development'] }, data: { teamLeaderId: teamLeaders[0].id } });
  await prisma.department.update({ where: { id: deptMap['Content Writer'] }, data: { teamLeaderId: teamLeaders[1].id } });
  await prisma.department.update({ where: { id: deptMap['Graphic Design'] }, data: { teamLeaderId: teamLeaders[2].id } });
  await prisma.department.update({ where: { id: deptMap['Social Media'] }, data: { teamLeaderId: teamLeaders[3].id } });
  await prisma.department.update({ where: { id: deptMap['Outreach'] }, data: { teamLeaderId: teamLeaders[4].id } });
  await prisma.department.update({ where: { id: deptMap['HR'] }, data: { teamLeaderId: teamLeaders[5].id } });
  await prisma.department.update({ where: { id: deptMap['Admin'] }, data: { teamLeaderId: teamLeaders[6].id } });

  // Employees
  const employees = await Promise.all([
    prisma.user.create({ data: { name: 'Ananya Gupta', email: 'ananya@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Development'], designation: 'Frontend Developer' } }),
    prisma.user.create({ data: { name: 'Karan Malhotra', email: 'karan@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Development'], designation: 'Backend Developer' } }),
    prisma.user.create({ data: { name: 'Ishaan Rao', email: 'ishaan@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Development'], designation: 'DevOps Engineer' } }),
    prisma.user.create({ data: { name: 'Sneha Patel', email: 'sneha@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Content Writer'], designation: 'Content Writer' } }),
    prisma.user.create({ data: { name: 'Pooja Desai', email: 'pooja@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Graphic Design'], designation: 'Graphic Designer' } }),
    prisma.user.create({ data: { name: 'Tanvi Kulkarni', email: 'tanvi@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Social Media'], designation: 'Social Media Executive' } }),
    prisma.user.create({ data: { name: 'Varun Pillai', email: 'varun@acme.com', passwordHash: defaultPassword, role: 'employee', departmentId: deptMap['Outreach'], designation: 'Outreach Executive' } }),
  ]);

  console.log(`✓ Created ${1 + teamLeaders.length + employees.length} users (1 Super Admin, ${teamLeaders.length} TLs, ${employees.length} Employees)`);

  // ============ TASKS ============
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in2Days = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const in4Days = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const tasks = [
    { title: 'Implement new authentication flow', description: 'JWT-based auth with refresh tokens', departmentId: deptMap['Development'], priority: 'high' as TaskPriority, status: 'in_progress' as TaskStatus, deadline: in2Days, createdById: teamLeaders[0].id, assigneeIds: [employees[0].id] },
    { title: 'Build notification service', description: 'In-app + email notifications', departmentId: deptMap['Development'], priority: 'high' as TaskPriority, status: 'in_progress' as TaskStatus, deadline: in2Days, createdById: teamLeaders[0].id, assigneeIds: [employees[1].id] },
    { title: 'Fix pagination bug on user list', departmentId: deptMap['Development'], priority: 'medium' as TaskPriority, status: 'assigned' as TaskStatus, deadline: tomorrow, createdById: teamLeaders[0].id, assigneeIds: [employees[0].id] },
    { title: 'Write Q4 product launch blog post', departmentId: deptMap['Content Writer'], priority: 'high' as TaskPriority, status: 'in_progress' as TaskStatus, deadline: in4Days, createdById: teamLeaders[1].id, assigneeIds: [teamLeaders[1].id, employees[3].id] },
    { title: 'Design homepage hero banner', departmentId: deptMap['Graphic Design'], priority: 'high' as TaskPriority, status: 'assigned' as TaskStatus, deadline: tomorrow, createdById: superAdmin.id, assigneeIds: [teamLeaders[2].id, employees[4].id] },
    { title: 'Schedule April Instagram content calendar', departmentId: deptMap['Social Media'], priority: 'medium' as TaskPriority, status: 'assigned' as TaskStatus, deadline: in4Days, createdById: teamLeaders[3].id, assigneeIds: [employees[5].id] },
    { title: 'Send outreach emails to new leads', departmentId: deptMap['Outreach'], priority: 'medium' as TaskPriority, status: 'in_progress' as TaskStatus, deadline: in4Days, createdById: teamLeaders[4].id, assigneeIds: [employees[6].id] },
    { title: 'Deploy v2.1 API to production', departmentId: deptMap['Development'], priority: 'high' as TaskPriority, status: 'completed' as TaskStatus, deadline: yesterday, createdById: teamLeaders[0].id, assigneeIds: [teamLeaders[0].id, employees[0].id] },
    { title: 'Database migration for v2.1', departmentId: deptMap['Development'], priority: 'high' as TaskPriority, status: 'completed' as TaskStatus, deadline: yesterday, createdById: teamLeaders[0].id, assigneeIds: [employees[0].id] },
  ];

  for (const t of tasks) {
    await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        departmentId: t.departmentId,
        priority: t.priority,
        status: t.status,
        deadline: t.deadline,
        createdById: t.createdById,
        startedAt: t.status === 'in_progress' || t.status === 'completed' ? yesterday : null,
        completedAt: t.status === 'completed' ? yesterday : null,
        assignees: { create: t.assigneeIds.map((userId) => ({ userId })) },
      },
    });
  }
  console.log(`✓ Created ${tasks.length} tasks`);

  // ============ REPORTS ============
  await prisma.report.createMany({
    data: [
      { userId: employees[0].id, reportType: 'daily', description: 'Completed JWT authentication flow. Started unit tests for user service.', reportDate: now, approvalStatus: 'pending', visibleToSuperAdmin: false },
      { userId: employees[1].id, reportType: 'daily', description: 'Fixed pagination bug. Optimized 3 slow database queries.', reportDate: now, approvalStatus: 'pending', visibleToSuperAdmin: false },
      { userId: employees[0].id, reportType: 'daily', description: 'Implemented new authentication flow. Wrote unit tests.', reportDate: yesterday, approvalStatus: 'approved', visibleToSuperAdmin: true, reviewedById: teamLeaders[0].id, reviewedAt: yesterday },
      { userId: teamLeaders[1].id, reportType: 'weekly', description: 'Completed 3 blog posts for Q4 launch. Coordinated with design team.', reportDate: now, approvalStatus: 'approved', visibleToSuperAdmin: true, reviewedById: teamLeaders[1].id, reviewedAt: now },
    ],
  });
  console.log('✓ Created 4 reports (2 pending, 2 approved)');

  // ============ NOTIFICATIONS ============
  await prisma.notification.createMany({
    data: [
      { userId: superAdmin.id, type: 'report_approved', title: 'Report approved by Team Leader', message: "Priya Sharma's weekly report is ready for review", referenceType: 'report', isRead: false },
      { userId: superAdmin.id, type: 'task_completed', title: 'Task completed', message: 'Arjun Khanna completed "Deploy v2.1 API"', referenceType: 'task', isRead: false },
      { userId: teamLeaders[0].id, type: 'report_submitted', title: 'New report to review', message: 'Ananya Gupta submitted a daily report', referenceType: 'report', isRead: false },
      { userId: employees[0].id, type: 'task_assigned', title: 'New task assigned', message: 'You have been assigned "Fix pagination bug on user list"', referenceType: 'task', isRead: false },
    ],
  });
  console.log('✓ Created 4 sample notifications');

  console.log('\n🎉 Seed complete!\n');
  console.log('Demo credentials (password for all: "password"):');
  console.log('  Super Admin: admin@taskflow.com');
  console.log('  Team Leader: arjun@acme.com');
  console.log('  Employee:    ananya@acme.com');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
