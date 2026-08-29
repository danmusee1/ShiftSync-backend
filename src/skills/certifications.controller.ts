import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CertificationsService } from './certifications.service.js';

@ApiTags('staff-certifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff/:staffId')
export class CertificationsController {
  constructor(private readonly certificationsService: CertificationsService) {}

  @Get('skills')
  listSkills(@Param('staffId') staffId: string) {
    return this.certificationsService.listSkills(staffId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('skills/:skillId')
  grantSkill(
    @Param('staffId') staffId: string,
    @Param('skillId') skillId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.certificationsService.grantSkill(staffId, skillId, actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('skills/:skillId')
  revokeSkill(
    @Param('staffId') staffId: string,
    @Param('skillId') skillId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.certificationsService.revokeSkill(staffId, skillId, actor);
  }

  @Get('locations')
  listLocations(@Param('staffId') staffId: string) {
    return this.certificationsService.listLocations(staffId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Post('locations/:locationId')
  certifyLocation(
    @Param('staffId') staffId: string,
    @Param('locationId') locationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.certificationsService.certifyLocation(staffId, locationId, actor);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Delete('locations/:locationId')
  decertifyLocation(
    @Param('staffId') staffId: string,
    @Param('locationId') locationId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.certificationsService.decertifyLocation(staffId, locationId, actor);
  }
}
