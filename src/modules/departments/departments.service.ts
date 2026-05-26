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
    // Capture the current team leader BEFORE the update so we can demote them
    // if the team leader has actually changed.
    const previous = await prisma.department.findUnique({
      where: { id },
      select: { teamLeaderId: true },
    });
    const previousTeamLeaderId = previous?.teamLeaderId ?? null;

    const department = await prisma.department.update({ where: { id }, data });

    const teamLeaderChanged =
      data.teamLeaderId !== undefined && data.teamLeaderId !== previousTeamLeaderId;

    // Demote the OLD team leader to a regular employee and unassign their
    // department, but only if they are actually being replaced by someone
    // else (or being cleared). Skip if no change.
    if (teamLeaderChanged && previousTeamLeaderId) {
      try {
        await prisma.user.update({
          where: { id: previousTeamLeaderId },
          data: { role: 'employee', departmentId: null },
        });
      } catch (err) {
        console.error('Error demoting previous team leader:', err);
      }
    }

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

    // If team leader was updated and group chat exists, sync members:
    // add the new leader, and remove the demoted previous leader.
    if (teamLeaderChanged) {
      try {
        const groupChat = await chatService.getDepartmentGroupChat(id);
        if (groupChat) {
          const oldMembers = groupChat.participants.map((p) => p.userId);
          const newTeamLeaderId = data.teamLeaderId;

          if (newTeamLeaderId && !oldMembers.includes(newTeamLeaderId)) {
            await chatService.addMemberToDepartmentGroup(groupChat.id, newTeamLeaderId);
          }

          if (
            previousTeamLeaderId &&
            previousTeamLeaderId !== newTeamLeaderId &&
            oldMembers.includes(previousTeamLeaderId)
          ) {
            await chatService.removeMemberFromDepartmentGroup(groupChat.id, previousTeamLeaderId);
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
