import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { TimeclockService } from './timeclock.service.js';

@ApiTags('timeclock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class TimeclockController {
  constructor(private readonly timeclockService: TimeclockService) {}

  @Post('shifts/:shiftId/clock-in')
  clockIn(@Param('shiftId') shiftId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.timeclockService.clockIn(shiftId, actor);
  }

  @Post('shifts/:shiftId/clock-out')
  clockOut(@Param('shiftId') shiftId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.timeclockService.clockOut(shiftId, actor);
  }

  @Get('locations/:locationId/on-duty')
  getOnDuty(@Param('locationId') locationId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.timeclockService.getOnDutyForLocation(locationId, actor);
  }
}
