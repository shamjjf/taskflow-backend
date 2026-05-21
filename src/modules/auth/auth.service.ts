import { prisma } from '@/config/prisma';
import { hashPassword, comparePassword } from '@/utils/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@/utils/jwt';
import { UserRole } from '@prisma/client';
import { socketEvents } from '@/sockets';

export const authService = {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { department: { select: { name: true } } },
    });

    if (!user || user.status !== 'active') {
      throw new Error('Invalid credentials');
    }

    const isValid = await comparePassword(password, user.passwordHash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken, lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.departmentId,
        departmentName: user.department?.name || null,
        designation: user.designation,
        profileImage: user.profileImage,
      },
    };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.refreshToken !== refreshToken) {
      throw new Error('Invalid refresh token');
    }

    const newPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    };

    return {
      accessToken: signAccessToken(newPayload),
      refreshToken: signRefreshToken(newPayload),
    };
  },

  async logout(userId: number) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  },

  async me(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { department: { select: { name: true } } },
    });

    if (!user) throw new Error('User not found');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.department?.name || null,
      designation: user.designation,
      profileImage: user.profileImage,
      status: user.status,
    };
  },

  async changePassword(userId: number, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new Error('User not found');

    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) throw new Error('Current password is incorrect');

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, refreshToken: null },
    });
  },

  async setUserPassword(userId: number, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new Error('User not found');

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, refreshToken: null },
    });
  },

  async register(data: {
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
};
