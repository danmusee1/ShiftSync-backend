import { Module } from '@nestjs/common';
import { TimeclockController } from './timeclock.controller.js';
import { TimeclockService } from './timeclock.service.js';

@Module({
  controllers: [TimeclockController],
  providers: [TimeclockService],
})
export class TimeclockModule {}
