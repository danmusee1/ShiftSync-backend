import { Module } from '@nestjs/common';
import { CertificationsController } from './certifications.controller.js';
import { CertificationsService } from './certifications.service.js';
import { SkillsController } from './skills.controller.js';
import { SkillsService } from './skills.service.js';

@Module({
  controllers: [SkillsController, CertificationsController],
  providers: [SkillsService, CertificationsService],
  exports: [SkillsService, CertificationsService],
})
export class SkillsModule {}
