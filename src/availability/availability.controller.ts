import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AvailabilityService } from './availability.service.js';
import { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto.js';
import { CreateAvailabilityRuleDto } from './dto/create-availability-rule.dto.js';
import { UpdateAvailabilityRuleDto } from './dto/update-availability-rule.dto.js';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('staff/:staffId/availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('rules')
  listRules(@Param('staffId') staffId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.availabilityService.listRules(staffId, actor);
  }

  @Post('rules')
  createRule(
    @Param('staffId') staffId: string,
    @Body() dto: CreateAvailabilityRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.availabilityService.createRule(staffId, dto, actor);
  }

  @Patch('rules/:ruleId')
  updateRule(
    @Param('staffId') staffId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateAvailabilityRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.availabilityService.updateRule(staffId, ruleId, dto, actor);
  }

  @Delete('rules/:ruleId')
  deleteRule(
    @Param('staffId') staffId: string,
    @Param('ruleId') ruleId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.availabilityService.deleteRule(staffId, ruleId, actor);
  }

  @Get('exceptions')
  listExceptions(@Param('staffId') staffId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.availabilityService.listExceptions(staffId, actor);
  }

  @Post('exceptions')
  createException(
    @Param('staffId') staffId: string,
    @Body() dto: CreateAvailabilityExceptionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.availabilityService.createException(staffId, dto, actor);
  }

  @Delete('exceptions/:exceptionId')
  deleteException(
    @Param('staffId') staffId: string,
    @Param('exceptionId') exceptionId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.availabilityService.deleteException(staffId, exceptionId, actor);
  }
}
