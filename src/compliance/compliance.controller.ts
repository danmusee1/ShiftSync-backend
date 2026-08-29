import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { ComplianceService } from './compliance.service.js';

@ApiTags('compliance')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('overtime')
  getWeeklyOvertimeReport(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('weekStartDate') weekStartDate: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.complianceService.getWeeklyOvertimeReport(weekStartDate, actor, locationId);
  }
}
