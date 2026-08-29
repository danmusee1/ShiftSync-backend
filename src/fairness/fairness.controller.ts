import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { FairnessService } from './fairness.service.js';

@ApiTags('fairness')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fairness')
export class FairnessController {
  constructor(private readonly fairnessService: FairnessService) {}

  @Get('hours-distribution')
  getHoursDistribution(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.fairnessService.getHoursDistribution(from, to, actor, locationId);
  }

  @Get('premium-shifts')
  getPremiumShiftFairness(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.fairnessService.getPremiumShiftFairness(from, to, actor, locationId);
  }

  @Get('desired-hours')
  getDesiredHoursComparison(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('weekStartDate') weekStartDate: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.fairnessService.getDesiredHoursComparison(weekStartDate, actor, locationId);
  }
}
