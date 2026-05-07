import { prisma } from '@/config/prisma';
import { UserRole } from '@prisma/client';
import { hashPassword } from '@/utils/password';
import { chatService } from '../chat/chat.service';

export interface UsersFilters {
  departmentId?: number;
  role?: UserRole;
  status?: 'active' | 'inactive';
}

export const usersService = {
  async list(filters: UsersFilters, _requester: { role: UserRole; departmentId: number | null }) {
    const where: {
      departmentId?: number;
      role?: UserRole;
      status?: 'active' | 'inactive';
    } = {};

    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.role) where.role = filters.role;
    if (filters.status) where.status = filters.status;

    return prisma.user.findMany({
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
  },

  async getById(id: number) {
    return prisma.user.findUnique({
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

    return user;
  },

  async update(
    id: number,
    data: { name?: string; designation?: string; phone?: string; profileImage?: string }
  ) {
    return prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        designation: true,
      },
    });
  },

  async updateStatus(id: number, status: 'active' | 'inactive') {
    return prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, status: true },
    });
  },

  async delete(id: number) {
    return prisma.user.delete({ where: { id } });
  },
};
