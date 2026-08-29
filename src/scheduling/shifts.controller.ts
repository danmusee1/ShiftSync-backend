import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreateShiftDto } from './dto/create-shift.dto.js';
import { UpdateShiftDto } from './dto/update-shift.dto.js';
import { ShiftsService } from './shifts.service.js';

@ApiTags('scheduling')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('schedule-weeks/:scheduleWeekId/shifts')
  create(
    @Param('scheduleWeekId') scheduleWeekId: string,
    @Body() dto: CreateShiftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shiftsService.create(scheduleWeekId, dto, actor);
  }

  @Get('shifts/:id')
  findOne(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Patch('shifts/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateShiftDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.shiftsService.update(id, dto, actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('shifts/:id')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.shiftsService.remove(id, actor);
  }
}
