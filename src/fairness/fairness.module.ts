import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module.js';
import { FairnessController } from './fairness.controller.js';
import { FairnessService } from './fairness.service.js';

@Module({
  imports: [ComplianceModule],
  controllers: [FairnessController],
  providers: [FairnessService],
})
export class FairnessModule {}
