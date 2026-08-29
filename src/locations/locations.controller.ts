import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Location } from '@prisma/client';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';
import { LocationsService } from './locations.service.js';

@ApiTags('locations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Roles(Role.ADMIN)
  @Post()
  create(
    @Body() dto: CreateLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Location> {
    return this.locationsService.create(dto, actor);
  }

  @Get()
  findAll(@CurrentUser() actor: AuthenticatedUser): Promise<Location[]> {
    return this.locationsService.findAll(actor);
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Location> {
    return this.locationsService.findOne(id);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Location> {
    return this.locationsService.update(id, dto, actor);
  }

  @Roles(Role.ADMIN)
  @Post(':id/managers/:managerId')
  assignManager(
    @Param('id') id: string,
    @Param('managerId') managerId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.locationsService.assignManager(id, managerId, actor);
  }

  @Roles(Role.ADMIN)
  @Delete(':id/managers/:managerId')
  unassignManager(
    @Param('id') id: string,
    @Param('managerId') managerId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.locationsService.unassignManager(id, managerId, actor);
  }
}
