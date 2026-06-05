import { prisma } from '@/config/prisma';
import { UserRole } from '@prisma/client';
import { hashPassword } from '@/utils/password';
import { chatService } from '../chat/chat.service';
import { socketEvents } from '@/sockets';

export interface UsersFilters {
  departmentId?: number;
  role?: UserRole;
  status?: 'active' | 'inactive';
}

export const usersService = {
  async list(filters: UsersFilters, requester: { role: UserRole; departmentId: number | null }) {
    const where: {
      departmentId?: number;
      role?: UserRole | { in?: UserRole[]; notIn?: UserRole[] };
      status?: 'active' | 'inactive';
    } = {};

    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.status) where.status = filters.status;

    if (requester.role === 'admin') {
      if (filters.role) {
        if (filters.role === 'admin' || filters.role === 'super_admin') {
          where.role = { in: [] };
        } else {
          where.role = filters.role;
        }
      } else {
        where.role = { notIn: ['admin', 'super_admin'] };
      }
    } else if (requester.role === 'team_leader' || requester.role === 'employee') {
      // Non-admin roles can only see members of their own department, and
      // they cannot see admins / the super admin even within that dept.
      if (!requester.departmentId) {
        return [];
      }
      where.departmentId = requester.departmentId;
      where.role = { notIn: ['admin', 'super_admin'] };
    } else if (filters.role) {
      where.role = filters.role;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        department: { select: { name: true } },
        designation: true,
        profileImage: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    });
    // Flatten { department: { name } } -> { departmentName } so the response
    // matches the shape the frontends expect (the auth/login endpoint
    // already returns it this way).
    return users.map(({ department, ...u }) => ({
      ...u,
      departmentName: department?.name ?? null,
    }));
  },

  async getById(id: number) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        department: { select: { name: true } },
        designation: true,
        profileImage: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    if (!user) return null;
    const { department, ...rest } = user;
    return { ...rest, departmentName: department?.name ?? null };
  },

  async create(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    departmentId?: number;
    designation?: string;
  }) {
    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role,
        departmentId: data.departmentId,
        designation: data.designation,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
      },
    });

    // Auto-enroll the new user into their department's group chat (if any).
    if (user.departmentId) {
      try {
        await chatService.addUserToDepartmentGroupIfMember(user.id, user.departmentId);
      } catch (err) {
        console.error('Failed to add new user to department group chat:', err);
      }
    }

    // Broadcast so the new user appears in team lists & admin user tables
    // without a manual refresh.
    try {
      socketEvents.userCreated(
        { id: user.id, departmentId: user.departmentId },
        user
      );
    } catch (err) {
      console.error('Failed to emit user:created socket event:', err);
    }

    return user;
  },

  async update(
    id: number,
    data: {
      name?: string;
      designation?: string;
      phone?: string;
      profileImage?: string;
      email?: string;
      departmentId?: number | null;
      status?: 'active' | 'inactive';
      role?: UserRole;
    }
  ) {
    // Any change that affects the user's authorization context (role, dept,
    // or being deactivated) must invalidate their existing sessions so the
    // stale JWT cannot keep granting the old privileges. The access token
    // carries role + departmentId, so without this an admin demoted to
    // employee keeps admin scope until the access token expires.
    const securityImpactingChange =
      data.role !== undefined ||
      data.departmentId !== undefined ||
      data.status === 'inactive';

    const updatePayload = securityImpactingChange
      ? { ...data, refreshToken: null }
      : data;

    return prisma.user.update({
      where: { id },
      data: updatePayload,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        department: { select: { name: true } },
        designation: true,
        phone: true,
        profileImage: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
  },

  async updateStatus(id: number, status: 'active' | 'inactive') {
    return prisma.user.update({
      where: { id },
      // Deactivating must also kill the user's refresh token so they
      // cannot mint a new access token after being disabled.
      data: status === 'inactive' ? { status, refreshToken: null } : { status },
      select: { id: true, status: true },
    });
  },

  async delete(id: number) {
    return prisma.user.delete({ where: { id } });
  },
};
