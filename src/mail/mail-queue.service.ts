import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { EMAIL_QUEUE, SEND_NOTIFICATION_EMAIL_JOB } from '../jobs/queue-names.js';
import type { SendNotificationEmailJobData } from './email.processor.js';

/**
 * The API the rest of the app should call to send an email — enqueues the
 * work instead of opening an SMTP connection inline, so a request that fans
 * out to many recipients (e.g. publishing a schedule) returns immediately.
 */
@Injectable()
export class MailQueueService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue) {}

  async enqueueNotificationEmail(data: SendNotificationEmailJobData): Promise<void> {
    await this.emailQueue.add(SEND_NOTIFICATION_EMAIL_JOB, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}
