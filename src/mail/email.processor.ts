import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { SEND_NOTIFICATION_EMAIL_JOB, EMAIL_QUEUE } from '../jobs/queue-names.js';
import { MailService } from './mail.service.js';

export interface SendNotificationEmailJobData {
  to: string;
  subject: string;
  body: string;
}

/**
 * Real SMTP sends happen here, off the request path — a slow or unreachable
 * mail server should never make an API call (e.g. publishing a schedule to
 * dozens of staff) hang waiting on sequential SMTP round-trips.
 */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(private readonly mailService: MailService) {
    super();
  }

  async process(job: Job<SendNotificationEmailJobData>): Promise<void> {
    if (job.name !== SEND_NOTIFICATION_EMAIL_JOB) return;
    const { to, subject, body } = job.data;
    await this.mailService.sendNotificationEmail(to, subject, body);
  }
}
