import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccessModule } from './access/access.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AvailabilityModule } from './availability/availability.module.js';
import configuration from './config/configuration.js';
import { validate } from './config/env.validation.js';
import { JobsModule } from './jobs/jobs.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SchedulingModule } from './scheduling/scheduling.module.js';
import { SkillsModule } from './skills/skills.module.js';
import { SwapsModule } from './swaps/swaps.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    PrismaModule,
    AccessModule,
    AuditModule,
    JobsModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    SkillsModule,
    AvailabilityModule,
    SchedulingModule,
    SwapsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
