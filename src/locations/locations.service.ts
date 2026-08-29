import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditEntityType, type Location, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { UpdateLocationDto } from './dto/update-location.dto.js';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateLocationDto, actor: AuthenticatedUser): Promise<Location> {
    const location = await this.prisma.location.create({ data: dto });
    await this.audit.record({
      entityType: AuditEntityType.LOCATION,
      entityId: location.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: location,
      locationId: location.id,
    });
    return location;
  }

  async findAll(actor: AuthenticatedUser): Promise<Location[]> {
    if (actor.role === Role.ADMIN) {
      return this.prisma.location.findMany({ orderBy: { name: 'asc' } });
    }

    if (actor.role === Role.MANAGER) {
      return this.prisma.location.findMany({
        where: { managerLocations: { some: { managerId: actor.id } } },
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.location.findMany({
      where: { staffLocations: { some: { staffId: actor.id, decertifiedAt: null } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string): Promise<Location> {
    return this.getOrThrow(id);
  }

  async update(id: string, dto: UpdateLocationDto, actor: AuthenticatedUser): Promise<Location> {
    const before = await this.getOrThrow(id);
    const location = await this.prisma.location.update({ where: { id }, data: dto });
    await this.audit.record({
      entityType: AuditEntityType.LOCATION,
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: actor.id,
      beforeState: before,
      afterState: location,
      locationId: id,
    });
    return location;
  }

  async assignManager(
    locationId: string,
    managerId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.getOrThrow(locationId);
    await this.prisma.managerLocation.upsert({
      where: { managerId_locationId: { managerId, locationId } },
      create: { managerId, locationId },
      update: {},
    });
    await this.audit.record({
      entityType: AuditEntityType.LOCATION,
      entityId: locationId,
      action: AuditAction.ASSIGN,
      actorId: actor.id,
      afterState: { managerId },
      locationId,
    });
  }

  async unassignManager(
    locationId: string,
    managerId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.prisma.managerLocation.deleteMany({ where: { managerId, locationId } });
    await this.audit.record({
      entityType: AuditEntityType.LOCATION,
      entityId: locationId,
      action: AuditAction.UNASSIGN,
      actorId: actor.id,
      beforeState: { managerId },
      locationId,
    });
  }

  private async getOrThrow(id: string): Promise<Location> {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }
}
