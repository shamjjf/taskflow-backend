import { prisma } from '@/config/prisma';
import { chatService } from '../chat/chat.service';

export const departmentsService = {
  async list() {
    const departments = await prisma.department.findMany({
      include: {
        teamLeader: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            users: true,
            tasks: { where: { status: { in: ['assigned', 'in_progress'] } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      teamLeaderId: d.teamLeaderId,
      teamLeaderName: d.teamLeader?.name || null,
      memberCount: d._count.users,
      activeTaskCount: d._count.tasks,
      createdAt: d.createdAt,
    }));
  },

  async getById(id: number) {
    return prisma.department.findUnique({
      where: { id },
      include: {
        teamLeader: { select: { id: true, name: true, email: true } },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            designation: true,
            profileImage: true,
            status: true,
          },
        },
      },
    });
  },

  async create(data: { name: string; description?: string; teamLeaderId?: number }) {
    const department = await prisma.department.create({ data });

    // Get super admin to create the group chat
    const superAdmin = await prisma.user.findFirst({
      where: { role: 'super_admin' },
      select: { id: true },
    });

    if (superAdmin) {
      try {
        // Create department group chat
        await chatService.createDepartmentGroupChat(department.id, superAdmin.id);
      } catch (err) {
        // Log the error but don't fail the department creation
        console.error('Error creating department group chat:', err);
      }
    }

    return department;
  },

  async update(id: number, data: { name?: string; description?: string; teamLeaderId?: number }) {
    const department = await prisma.department.update({ where: { id }, data });

    // When the team leader changes, also pin the new TL's User.departmentId
    // to this dept and bump them to role 'team_leader'. Without this, the TL
    // can be assigned to a dept without belonging to it, which then makes
    // their "My Team" list empty (it queries by user.departmentId).
    if (data.teamLeaderId !== undefined && data.teamLeaderId !== null) {
      try {
        await prisma.user.update({
          where: { id: data.teamLeaderId },
          data: { departmentId: id, role: 'team_leader' },
        });
      } catch (err) {
        console.error('Error syncing new team leader\'s departmentId:', err);
      }
    }

    // If team leader was updated and group chat exists, update members
    if (data.teamLeaderId !== undefined) {
      try {
        const groupChat = await chatService.getDepartmentGroupChat(id);
        if (groupChat) {
          const oldMembers = groupChat.participants.map((p) => p.userId);
          const newTeamLeaderId = data.teamLeaderId;

          // Add new team leader if not already a member
          if (newTeamLeaderId && !oldMembers.includes(newTeamLeaderId)) {
            await chatService.addMemberToDepartmentGroup(groupChat.id, newTeamLeaderId);
          }
        }
      } catch (err) {
        console.error('Error updating department group chat:', err);
      }
    }

    return department;
  },

  async delete(id: number) {
    return prisma.department.delete({ where: { id } });
  },

  async assignLeader(id: number, teamLeaderId: number) {
    // Update the user to be team_leader
    await prisma.user.update({
      where: { id: teamLeaderId },
      data: { role: 'team_leader', departmentId: id },
    });

    const department = await prisma.department.update({
      where: { id },
      data: { teamLeaderId },
    });

    // Update group chat membership
    try {
      const groupChat = await chatService.getDepartmentGroupChat(id);
      if (groupChat) {
        const oldMembers = groupChat.participants.map((p) => p.userId);
        if (!oldMembers.includes(teamLeaderId)) {
          await chatService.addMemberToDepartmentGroup(groupChat.id, teamLeaderId);
        }
      }
    } catch (err) {
      console.error('Error adding team leader to group chat:', err);
    }

    return department;
  },

  async getMembers(departmentId: number) {
    return prisma.user.findMany({
      where: { departmentId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        designation: true,
        profileImage: true,
        status: true,
        lastLoginAt: true,
      },
      orderBy: { name: 'asc' },
    });
  },
};
