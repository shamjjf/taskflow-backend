/**
 * In-memory tracker for live Agora call sessions.
 *
 * A session is created when the caller hits POST /api/agora/ring and is
 * removed when the call is finalized (reject for 1-on-1, or end). When the
 * session finalizes we know whether anyone accepted, when, and for how long
 * — enough to write a WhatsApp-style call entry into the chat.
 *
 * In-memory is fine because calls are transient and a process restart
 * mid-call is rare; the worst case is a missing chat entry for that one
 * dropped call.
 */

export interface CallSession {
  channelName: string;
  conversationId: number;
  callerId: number;
  callType: 'audio' | 'video';
  isGroup: boolean;
  /** Everyone the caller rang (excluding the caller). */
  participantIds: number[];
  startedAt: Date;
  /** Set the first time any receiver accepts. */
  acceptedAt?: Date;
  acceptedBy: Set<number>;
}

const sessions = new Map<string, CallSession>();

export const callSessions = {
  create(data: Omit<CallSession, 'startedAt' | 'acceptedBy'>): CallSession {
    const session: CallSession = {
      ...data,
      startedAt: new Date(),
      acceptedBy: new Set(),
    };
    sessions.set(data.channelName, session);
    return session;
  },

  get(channelName: string): CallSession | undefined {
    return sessions.get(channelName);
  },

  markAccepted(channelName: string, userId: number): CallSession | undefined {
    const session = sessions.get(channelName);
    if (!session) return undefined;
    if (!session.acceptedAt) session.acceptedAt = new Date();
    session.acceptedBy.add(userId);
    return session;
  },

  /**
   * Remove and return a session. Returns undefined if the session was already
   * finalized (e.g. both sides hung up in quick succession).
   */
  remove(channelName: string): CallSession | undefined {
    const session = sessions.get(channelName);
    if (!session) return undefined;
    sessions.delete(channelName);
    return session;
  },
};
