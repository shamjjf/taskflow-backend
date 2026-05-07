import { prisma } from '@/config/prisma';
import { chatService } from '@/modules/chat/chat.service';

export const departmentGroupChatSeeder = {
  async createGroupChatsForAllDepartments() {
    try {
      // Get all departments
      const departments = await prisma.department.findMany({
        select: { id: true, name: true },
      });

      if (departments.length === 0) {
        console.log('[Seeder] No departments found');
        return { success: true, message: 'No departments found', count: 0 };
      }

      // Get super admin for creating group chats
      const superAdmin = await prisma.user.findFirst({
        where: { role: 'super_admin' },
        select: { id: true },
      });

      if (!superAdmin) {
        return { success: false, message: 'No super admin found' };
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (const dept of departments) {
        try {
          // Check if group chat already exists
          const existingGroupChat = await chatService.getDepartmentGroupChat(dept.id);

          if (existingGroupChat) {
            console.log(`[Seeder] Group chat already exists for department: ${dept.name}`);
            skippedCount++;
            continue;
          }

          // Create group chat
          await chatService.createDepartmentGroupChat(dept.id, superAdmin.id);
          console.log(`[Seeder] Created group chat for department: ${dept.name}`);
          createdCount++;
        } catch (err) {
          console.error(`[Seeder] Failed to create group chat for department ${dept.name}:`, err);
        }
      }

      return {
        success: true,
        message: `Created ${createdCount} group chats, skipped ${skippedCount}`,
        created: createdCount,
        skipped: skippedCount,
      };
    } catch (err) {
      console.error('[Seeder] Error seeding department group chats:', err);
      return { success: false, message: (err as Error).message };
    }
  },

  async createGroupChatForDepartment(departmentId: number) {
    try {
      const department = await prisma.department.findUnique({
        where: { id: departmentId },
        select: { id: true, name: true },
      });

      if (!department) {
        return { success: false, message: 'Department not found' };
      }

      // Check if group chat already exists
      const existingGroupChat = await chatService.getDepartmentGroupChat(departmentId);

      if (existingGroupChat) {
        return { success: false, message: 'Group chat already exists for this department' };
      }

      // Get super admin for creating group chats
      const superAdmin = await prisma.user.findFirst({
        where: { role: 'super_admin' },
        select: { id: true },
      });

      if (!superAdmin) {
        return { success: false, message: 'No super admin found' };
      }

      // Create group chat
      const groupChat = await chatService.createDepartmentGroupChat(departmentId, superAdmin.id);
      return { success: true, message: 'Group chat created successfully', data: groupChat };
    } catch (err) {
      console.error('[Seeder] Error creating group chat:', err);
      return { success: false, message: (err as Error).message };
    }
  },
};
