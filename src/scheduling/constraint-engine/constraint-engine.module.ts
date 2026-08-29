import { Module } from '@nestjs/common';
import { ConstraintEngineService } from './constraint-engine.service.js';

@Module({
  providers: [ConstraintEngineService],
  exports: [ConstraintEngineService],
})
export class ConstraintEngineModule {}
