import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreateScheduleWeekDto } from './dto/create-schedule-week.dto.js';
import { ScheduleWeeksService } from './schedule-weeks.service.js';

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ScheduleWeeksController {
  constructor(private readonly scheduleWeeksService: ScheduleWeeksService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('locations/:locationId/schedule-weeks')
  getOrCreate(
    @Param('locationId') locationId: string,
    @Body() dto: CreateScheduleWeekDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scheduleWeeksService.getOrCreate(locationId, dto, actor);
  }

  @Get('locations/:locationId/schedule-weeks')
  findAllForLocation(
    @Param('locationId') locationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.scheduleWeeksService.findAllForLocation(locationId, actor);
  }

  @Get('schedule-weeks/:id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.scheduleWeeksService.findOne(id, actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('schedule-weeks/:id/publish')
  publish(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.scheduleWeeksService.publish(id, actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('schedule-weeks/:id/unpublish')
  unpublish(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.scheduleWeeksService.unpublish(id, actor);
  }
}
