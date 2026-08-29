import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/configuration.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        // BullMQ requires maxRetriesPerRequest: null on connections it manages,
        // since it issues blocking commands internally.
        connection: new Redis(configService.get('redis.url', { infer: true }), {
          maxRetriesPerRequest: null,
        }),
      }),
    }),
  ],
  exports: [BullModule],
})
export class JobsModule {}
