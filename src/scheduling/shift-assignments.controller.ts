import { Body, Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { AssignStaffDto } from './dto/assign-staff.dto.js';
import { ShiftAssignmentsService } from './shift-assignments.service.js';

@ApiTags('scheduling')
@ApiBearerAuth()
@Roles(Role.ADMIN, Role.MANAGER)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('shifts/:shiftId/assignments')
export class ShiftAssignmentsController {
  constructor(private readonly shiftAssignmentsService: ShiftAssignmentsService) {}

  @Post()
  assign(
    @Param('shiftId') shiftId: string,
    @Body() dto: AssignStaffDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shiftAssignmentsService.assign(shiftId, dto.staffId, actor);
  }

  @Post('preview')
  preview(
    @Param('shiftId') shiftId: string,
    @Body() dto: AssignStaffDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shiftAssignmentsService.preview(shiftId, dto.staffId, actor);
  }

  @Delete(':staffId')
  unassign(
    @Param('shiftId') shiftId: string,
    @Param('staffId') staffId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shiftAssignmentsService.unassign(shiftId, staffId, actor);
  }
}
