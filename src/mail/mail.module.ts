import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { EMAIL_QUEUE } from '../jobs/queue-names.js';
import { EmailProcessor } from './email.processor.js';
import { MailQueueService } from './mail-queue.service.js';
import { MailService } from './mail.service.js';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        transport: {
          host: configService.get('smtp.host', { infer: true }),
          port: configService.get('smtp.port', { infer: true }),
          secure: configService.get('smtp.secure', { infer: true }),
          auth: {
            user: configService.get('smtp.user', { infer: true }),
            pass: configService.get('smtp.password', { infer: true }),
          },
        },
        defaults: { from: configService.get('smtp.from', { infer: true }) },
      }),
    }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  providers: [MailService, MailQueueService, EmailProcessor],
  exports: [MailQueueService],
})
export class MailModule {}
