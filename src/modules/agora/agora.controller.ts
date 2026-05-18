import { Request, Response } from 'express';
import { z } from 'zod';
import { agoraService } from './agora.service';
import { ok, unauthorized } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { socketEvents } from '@/sockets';
import { prisma } from '@/config/prisma';
import { callSessions, type CallSession } from './callSessions';
import { chatService, type CallEventData, type CallEventOutcome } from '../chat/chat.service';

const tokenSchema = z.object({
  channelName: z.string().min(1).max(64),
});

const ringSchema = z.object({
  conversationId: z.number(),
  channelName: z.string().min(1).max(64),
  callType: z.enum(['audio', 'video']),
  participantIds: z.array(z.number()).min(1), // Who to ring
  isGroup: z.boolean().optional(),
  groupName: z.string().max(150).optional(),
});

const callActionSchema = z.object({
  channelName: z.string().min(1).max(64),
  participantIds: z.array(z.number()).min(1),
  isGroup: z.boolean().optional(),
});

/**
 * Finalize a session: build the CallEventData payload, persist it as a
 * chat message, and broadcast it on the conversation socket room so both
 * sides see the new entry in real time.
 */
async function logCallEvent(session: CallSession, outcome: CallEventOutcome) {
  const endedAt = new Date();
  const durationSec =
    outcome === 'answered' && session.acceptedAt
      ? Math.max(0, Math.round((endedAt.getTime() - session.acceptedAt.getTime()) / 1000))
      : 0;

  const data: CallEventData = {
    callType: session.callType,
    outcome,
    callerId: session.callerId,
    channelName: session.channelName,
    startedAt: session.startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationSec,
    isGroup: session.isGroup,
    participantIds: session.participantIds,
  };

  try {
    const message = await chatService.createCallEventMessage(session.conversationId, data);
    socketEvents.newMessage(session.conversationId, message);
  } catch (err) {
    // Never let logging failures break the call signaling path.
    console.error('[Call] Failed to log call event:', err);
  }
}

export const agoraController = {
  /**
   * POST /api/agora/token
   * Body: { channelName }
   *
   * Generates an Agora RTC token for the authenticated user to join the channel.
   * The Agora uid will be the user's numeric id.
   */
  generateToken: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const { channelName } = tokenSchema.parse(req.body);

    const result = agoraService.generateRtcToken(channelName, req.user.userId);
    return ok(res, result);
  }),

  /**
   * POST /api/agora/ring
   * Body: { conversationId, channelName, callType, participantIds, isGroup? }
   *
   * Notify other users (via socket) that a call is incoming.
   * The caller has already joined the Agora channel; receivers will join after accepting.
   */
  ring: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = ringSchema.parse(req.body);

    // Don't ring yourself
    const targetIds = data.participantIds.filter((id) => id !== req.user!.userId);

    // Track this call so we can log the outcome to chat when it ends.
    callSessions.create({
      channelName: data.channelName,
      conversationId: data.conversationId,
      callerId: req.user.userId,
      callType: data.callType,
      isGroup: data.isGroup ?? false,
      participantIds: targetIds,
    });

    // Fetch the caller's name + profile so receivers can show a real identity,
    // not just `john` from `john@example.com`.
    const caller = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, email: true, profileImage: true },
    });

    socketEvents.callIncoming(targetIds, {
      conversationId: data.conversationId,
      channelName: data.channelName,
      callType: data.callType,
      isGroup: data.isGroup ?? false,
      groupName: data.groupName,
      caller: {
        id: req.user.userId,
        name: caller?.name || req.user.email.split('@')[0],
        email: req.user.email,
        profileImage: caller?.profileImage || undefined,
      },
      startedAt: new Date().toISOString(),
    });

    return ok(res, { ringing: targetIds.length });
  }),

  /**
   * POST /api/agora/accept
   * Body: { channelName, participantIds, isGroup? }
   *
   * Tell the caller (and other ringing devices of the same user) the call was accepted.
   */
  accept: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = callActionSchema.parse(req.body);

    callSessions.markAccepted(data.channelName, req.user.userId);

    socketEvents.callAccepted(data.participantIds, {
      channelName: data.channelName,
      acceptedBy: req.user.userId,
      isGroup: data.isGroup ?? false,
    });

    return ok(res, { accepted: true });
  }),

  /**
   * POST /api/agora/reject
   * Body: { channelName, participantIds, isGroup? }
   *
   * Tell the caller the call was rejected (or all ringing devices to stop ringing).
   * For group calls, this is informational only — the caller stays in the call
   * because other participants may still join.
   */
  reject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = callActionSchema.parse(req.body);

    socketEvents.callRejected(data.participantIds, {
      channelName: data.channelName,
      rejectedBy: req.user.userId,
      isGroup: data.isGroup ?? false,
    });

    // For 1-on-1 calls, a rejection terminates the call. For groups, other
    // members may still pick up so we don't finalize yet — the caller's
    // eventual `end` call will be what closes the session.
    const session = callSessions.get(data.channelName);
    const isGroup = data.isGroup ?? session?.isGroup ?? false;
    if (!isGroup) {
      const removed = callSessions.remove(data.channelName);
      if (removed) {
        await logCallEvent(removed, 'declined');
      }
    }

    return ok(res, { rejected: true });
  }),

  /**
   * POST /api/agora/end
   * Body: { channelName, participantIds, isGroup? }
   *
   * Tell all participants to leave the call. For group calls, the FE only
   * sends this when the caller forcibly ends the call for everyone — a
   * single user leaving just hangs up locally.
   */
  end: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = callActionSchema.parse(req.body);

    socketEvents.callEnded(data.participantIds, {
      channelName: data.channelName,
      endedBy: req.user.userId,
      isGroup: data.isGroup ?? false,
    });

    const removed = callSessions.remove(data.channelName);
    if (removed) {
      const outcome: CallEventOutcome = removed.acceptedAt
        ? 'answered'
        : removed.callerId === req.user.userId
          ? 'cancelled'
          : 'missed';
      await logCallEvent(removed, outcome);
    }

    return ok(res, { ended: true });
  }),
};
