import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { verifyAccessToken, JwtPayload } from '@/utils/jwt';
import { env } from '@/config/env';

let io: SocketIOServer | null = null;

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload;
}

export function initSocketServer(httpServer: HTTPServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: env.CORS_ORIGINS,
      credentials: true,
    },
  });

  // Auth middleware for sockets
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error: No token'));
    try {
      const payload = verifyAccessToken(token);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[Socket] User ${socket.user?.userId} connected (${socket.id})`);

    // Auto-join user-specific room for targeted notifications
    if (socket.user) {
      socket.join(`user:${socket.user.userId}`);

      // Join department room
      if (socket.user.departmentId) {
        socket.join(`dept:${socket.user.departmentId}`);
      }

      // Join role-based room
      socket.join(`role:${socket.user.role}`);
    }

    socket.on('disconnect', () => {
      console.log(`[Socket] User ${socket.user?.userId} disconnected`);
    });

    // Join a conversation room
    socket.on('chat:join', (conversationId: number) => {
      socket.join(`conv:${conversationId}`);
    });

    // Leave a conversation room
    socket.on('chat:leave', (conversationId: number) => {
      socket.leave(`conv:${conversationId}`);
    });

    // Typing indicator
    socket.on('chat:typing', (data: { conversationId: number }) => {
      if (socket.user) {
        socket
          .to(`conv:${data.conversationId}`)
          .emit('chat:typing', { userId: socket.user.userId, conversationId: data.conversationId });
      }
    });
  });

  return io;
}

export function getIO(): SocketIOServer {
  if (!io) throw new Error('Socket.IO not initialized. Call initSocketServer first.');
  return io;
}

// Helper functions to emit events
export const socketEvents = {
  // Task events
  taskAssigned(assigneeIds: number[], task: unknown) {
    assigneeIds.forEach((id) => getIO().to(`user:${id}`).emit('task:assigned', task));
  },

  taskStarted(taskId: number, departmentId: number, task: unknown) {
    getIO().to(`dept:${departmentId}`).emit('task:started', { taskId, task });
    getIO().to('role:super_admin').emit('task:started', { taskId, task });
  },

  taskCompleted(taskId: number, departmentId: number, task: unknown) {
    getIO().to(`dept:${departmentId}`).emit('task:completed', { taskId, task });
    getIO().to('role:super_admin').emit('task:completed', { taskId, task });
  },

  taskCommented(taskId: number, participantIds: number[], comment: unknown) {
    participantIds.forEach((id) => getIO().to(`user:${id}`).emit('task:commented', { taskId, comment }));
  },

  // Report events
  reportSubmitted(tlUserId: number, report: unknown) {
    getIO().to(`user:${tlUserId}`).emit('report:submitted', report);
  },

  reportApproved(authorUserId: number, report: unknown) {
    getIO().to(`user:${authorUserId}`).emit('report:approved', report);
    getIO().to('role:super_admin').emit('report:new_approved', report);
  },

  reportRejected(authorUserId: number, report: unknown) {
    getIO().to(`user:${authorUserId}`).emit('report:rejected', report);
  },

  // Chat events
  newMessage(conversationId: number, message: unknown) {
    getIO().to(`conv:${conversationId}`).emit('message:new', message);
  },

  // Notification event
  newNotification(userId: number, notification: unknown) {
    getIO().to(`user:${userId}`).emit('notification:new', notification);
  },
};
