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
  taskAssigned(assigneeIds: number[], departmentId: number | null, task: unknown) {
    const payload = { task };
    assigneeIds.forEach((id) => getIO().to(`user:${id}`).emit('task:assigned', payload));
    if (departmentId != null) getIO().to(`dept:${departmentId}`).emit('task:assigned', payload);
    getIO().to('role:super_admin').emit('task:assigned', payload);
  },

  taskStarted(taskId: number, departmentId: number | null, assigneeIds: number[], task: unknown) {
    const payload = { taskId, task };
    assigneeIds.forEach((id) => getIO().to(`user:${id}`).emit('task:started', payload));
    if (departmentId != null) getIO().to(`dept:${departmentId}`).emit('task:started', payload);
    getIO().to('role:super_admin').emit('task:started', payload);
  },

  taskCompleted(taskId: number, departmentId: number | null, assigneeIds: number[], task: unknown) {
    const payload = { taskId, task };
    assigneeIds.forEach((id) => getIO().to(`user:${id}`).emit('task:completed', payload));
    if (departmentId != null) getIO().to(`dept:${departmentId}`).emit('task:completed', payload);
    getIO().to('role:super_admin').emit('task:completed', payload);
  },

  taskReviewed(taskId: number, departmentId: number | null, assigneeIds: number[], task: unknown) {
    const payload = { taskId, task };
    assigneeIds.forEach((id) => getIO().to(`user:${id}`).emit('task:reviewed', payload));
    if (departmentId != null) getIO().to(`dept:${departmentId}`).emit('task:reviewed', payload);
    getIO().to('role:super_admin').emit('task:reviewed', payload);
  },

  taskRejected(taskId: number, departmentId: number | null, assigneeIds: number[], task: unknown) {
    const payload = { taskId, task };
    assigneeIds.forEach((id) => getIO().to(`user:${id}`).emit('task:rejected', payload));
    if (departmentId != null) getIO().to(`dept:${departmentId}`).emit('task:rejected', payload);
    getIO().to('role:super_admin').emit('task:rejected', payload);
  },

  taskCommented(taskId: number, participantIds: number[], comment: unknown) {
    participantIds.forEach((id) => getIO().to(`user:${id}`).emit('task:commented', { taskId, comment }));
  },

  // Report events
  reportSubmitted(tlUserId: number, report: unknown) {
    getIO().to(`user:${tlUserId}`).emit('report:submitted', report);
  },

  reportSubmittedToSuperAdmin(report: unknown) {
    getIO().to('role:super_admin').emit('report:admin_submitted', report);
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

  // User directory events — broadcast so team panels & admin user lists
  // refresh without a manual page reload.
  userCreated(user: { id: number; departmentId: number | null }, fullUser: unknown) {
    const payload = { user: fullUser };
    if (user.departmentId) {
      getIO().to(`dept:${user.departmentId}`).emit('user:created', payload);
    }
    getIO().to('role:super_admin').emit('user:created', payload);
    getIO().to('role:admin').emit('user:created', payload);
  },

  // Emitted when a user updates their own profile (name, phone, photo, etc.)
  // so every other client showing their avatar/name picks up the change.
  userUpdated(user: { id: number; departmentId: number | null }, fullUser: unknown) {
    const payload = { user: fullUser };
    // The user themselves (covers multi-tab / other devices)
    getIO().to(`user:${user.id}`).emit('user:profileUpdated', payload);
    if (user.departmentId) {
      getIO().to(`dept:${user.departmentId}`).emit('user:profileUpdated', payload);
    }
    getIO().to('role:super_admin').emit('user:profileUpdated', payload);
    getIO().to('role:admin').emit('user:profileUpdated', payload);
  },

  // ============ CALL EVENTS (Agora signaling) ============

  /** Ring receivers - they should show incoming call popup with ringtone */
  callIncoming(receiverIds: number[], payload: unknown) {
    receiverIds.forEach((id) => getIO().to(`user:${id}`).emit('call:incoming', payload));
  },

  /** Notify caller + other ringing devices that the call was accepted */
  callAccepted(participantIds: number[], payload: unknown) {
    participantIds.forEach((id) => getIO().to(`user:${id}`).emit('call:accepted', payload));
  },

  /** Notify caller (and stop ringing on other devices of receiver) that call was rejected */
  callRejected(participantIds: number[], payload: unknown) {
    participantIds.forEach((id) => getIO().to(`user:${id}`).emit('call:rejected', payload));
  },

  /** Notify all participants that the call has ended */
  callEnded(participantIds: number[], payload: unknown) {
    participantIds.forEach((id) => getIO().to(`user:${id}`).emit('call:ended', payload));
  },
};
