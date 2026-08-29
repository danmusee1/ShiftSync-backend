import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

/**
 * Real SMTP sending (per the project's confirmed decision). Deliberately
 * best-effort: a down/misconfigured mail server should never break the
 * in-app notification, which is the actual source of truth.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendNotificationEmail(to: string, subject: string, body: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        html: `<p>${escapeHtml(body)}</p>`,
        text: body,
      });
    } catch (error) {
      this.logger.warn(`Failed to send notification email to ${to}: ${(error as Error).message}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
