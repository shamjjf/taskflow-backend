import { env } from '@/config/env';
import { getTransporter } from './mail.transporter';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendMailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
  replyTo?: string;
}

export interface SendMailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export const mailService = {
  async send(options: SendMailOptions): Promise<SendMailResult> {
    if (!env.SMTP_HOST) {
      throw new Error('SMTP not configured: SMTP_HOST is empty');
    }

    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: Array.isArray(options.to) ? options.to.join(',') : options.to,
      cc: Array.isArray(options.cc) ? options.cc.join(',') : options.cc,
      bcc: Array.isArray(options.bcc) ? options.bcc.join(',') : options.bcc,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    return {
      messageId: info.messageId,
      accepted: (info.accepted as string[]) ?? [],
      rejected: (info.rejected as string[]) ?? [],
    };
  },
};
