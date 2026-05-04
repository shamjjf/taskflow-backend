import { Request, Response } from 'express';
import { z } from 'zod';
import { agoraService } from './agora.service';
import { ok, unauthorized } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { socketEvents } from '@/sockets';

const tokenSchema = z.object({
  channelName: z.string().min(1).max(64),
});

const ringSchema = z.object({
  conversationId: z.number(),
  channelName: z.string().min(1).max(64),
  callType: z.enum(['audio', 'video']),
  participantIds: z.array(z.number()).min(1), // Who to ring
});

const callActionSchema = z.object({
  channelName: z.string().min(1).max(64),
  participantIds: z.array(z.number()).min(1),
});

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
   * Body: { conversationId, channelName, callType, participantIds }
   *
   * Notify other users (via socket) that a call is incoming.
   * The caller has already joined the Agora channel; receivers will join after accepting.
   */
  ring: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = ringSchema.parse(req.body);

    // Don't ring yourself
    const targetIds = data.participantIds.filter((id) => id !== req.user!.userId);

    socketEvents.callIncoming(targetIds, {
      conversationId: data.conversationId,
      channelName: data.channelName,
      callType: data.callType,
      caller: {
        id: req.user.userId,
        email: req.user.email,
      },
      startedAt: new Date().toISOString(),
    });

    return ok(res, { ringing: targetIds.length });
  }),

  /**
   * POST /api/agora/accept
   * Body: { channelName, participantIds }
   *
   * Tell the caller (and other ringing devices of the same user) the call was accepted.
   */
  accept: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = callActionSchema.parse(req.body);

    socketEvents.callAccepted(data.participantIds, {
      channelName: data.channelName,
      acceptedBy: req.user.userId,
    });

    return ok(res, { accepted: true });
  }),

  /**
   * POST /api/agora/reject
   * Body: { channelName, participantIds }
   *
   * Tell the caller the call was rejected (or all ringing devices to stop ringing).
   */
  reject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = callActionSchema.parse(req.body);

    socketEvents.callRejected(data.participantIds, {
      channelName: data.channelName,
      rejectedBy: req.user.userId,
    });

    return ok(res, { rejected: true });
  }),

  /**
   * POST /api/agora/end
   * Body: { channelName, participantIds }
   *
   * Tell all participants to leave the call.
   */
  end: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = callActionSchema.parse(req.body);

    socketEvents.callEnded(data.participantIds, {
      channelName: data.channelName,
      endedBy: req.user.userId,
    });

    return ok(res, { ended: true });
  }),
};
