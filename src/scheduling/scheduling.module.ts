import { Module } from '@nestjs/common';
import { ConstraintEngineModule } from './constraint-engine/constraint-engine.module.js';
import { ScheduleWeeksController } from './schedule-weeks.controller.js';
import { ScheduleWeeksService } from './schedule-weeks.service.js';
import { ShiftAssignmentsController } from './shift-assignments.controller.js';
import { ShiftAssignmentsService } from './shift-assignments.service.js';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsService } from './shifts.service.js';

@Module({
  imports: [ConstraintEngineModule],
  controllers: [ScheduleWeeksController, ShiftsController, ShiftAssignmentsController],
  providers: [ScheduleWeeksService, ShiftsService, ShiftAssignmentsService],
  exports: [ScheduleWeeksService, ShiftsService, ShiftAssignmentsService, ConstraintEngineModule],
})
export class SchedulingModule {}
