import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { env } from '@/config/env';

const TOKEN_EXPIRY_SECONDS = 3600; // 1 hour

export const agoraService = {
  /**
   * Generate an RTC token for a user to join a video/audio call channel.
   *
   * @param channelName - The Agora channel name (we use convention `call-<conversationId>` or `call-<callId>`)
   * @param uid - Agora numeric uid (we pass userId)
   * @returns Token string + metadata
   */
  generateRtcToken(channelName: string, uid: number) {
    if (!env.AGORA_APP_ID || !env.AGORA_APP_CERTIFICATE) {
      throw new Error(
        'Agora credentials missing. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE in .env'
      );
    }

    const role = RtcRole.PUBLISHER; // Can publish + subscribe (normal call participant)

    // IMPORTANT: Agora expects ABSOLUTE timestamps (seconds since epoch),
    // NOT relative seconds. Passing 3600 here makes the token expire in 1970!
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTs = currentTimestamp + TOKEN_EXPIRY_SECONDS;
    const tokenExpireTs = privilegeExpireTs;

    const token = RtcTokenBuilder.buildTokenWithUid(
      env.AGORA_APP_ID,
      env.AGORA_APP_CERTIFICATE,
      channelName,
      uid,
      role,
      tokenExpireTs,
      privilegeExpireTs
    );

    return {
      token,
      appId: env.AGORA_APP_ID,
      channelName,
      uid,
      expiresIn: TOKEN_EXPIRY_SECONDS,
    };
  },
};
