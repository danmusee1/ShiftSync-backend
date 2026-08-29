import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  type AvailabilityException,
  type AvailabilityRule,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CreateAvailabilityExceptionDto } from './dto/create-availability-exception.dto.js';
import { CreateAvailabilityRuleDto } from './dto/create-availability-rule.dto.js';
import { UpdateAvailabilityRuleDto } from './dto/update-availability-rule.dto.js';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
  ) {}

  async listRules(staffId: string, actor: AuthenticatedUser): Promise<AvailabilityRule[]> {
    await this.locationAccess.assertCanAccessStaff(actor, staffId);
    return this.prisma.availabilityRule.findMany({
      where: { staffId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createRule(
    staffId: string,
    dto: CreateAvailabilityRuleDto,
    actor: AuthenticatedUser,
  ): Promise<AvailabilityRule> {
    this.assertSelfServiceOrAdmin(staffId, actor);
    this.assertTimeOrder(dto.startTime, dto.endTime);

    const rule = await this.prisma.availabilityRule.create({
      data: { staffId, ...dto },
    });

    await this.audit.record({
      entityType: AuditEntityType.AVAILABILITY_RULE,
      entityId: rule.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: rule,
    });

    return rule;
  }

  async updateRule(
    staffId: string,
    ruleId: string,
    dto: UpdateAvailabilityRuleDto,
    actor: AuthenticatedUser,
  ): Promise<AvailabilityRule> {
    this.assertSelfServiceOrAdmin(staffId, actor);
    const before = await this.getRuleOrThrow(staffId, ruleId);

    if (dto.startTime || dto.endTime) {
      this.assertTimeOrder(dto.startTime ?? before.startTime, dto.endTime ?? before.endTime);
    }

    const rule = await this.prisma.availabilityRule.update({
      where: { id: ruleId },
      data: dto,
    });

    await this.audit.record({
      entityType: AuditEntityType.AVAILABILITY_RULE,
      entityId: rule.id,
      action: AuditAction.UPDATE,
      actorId: actor.id,
      beforeState: before,
      afterState: rule,
    });

    return rule;
  }

  async deleteRule(staffId: string, ruleId: string, actor: AuthenticatedUser): Promise<void> {
    this.assertSelfServiceOrAdmin(staffId, actor);
    const existing = await this.getRuleOrThrow(staffId, ruleId);

    await this.prisma.availabilityRule.delete({ where: { id: ruleId } });
    await this.audit.record({
      entityType: AuditEntityType.AVAILABILITY_RULE,
      entityId: ruleId,
      action: AuditAction.DELETE,
      actorId: actor.id,
      beforeState: existing,
    });
  }

  async listExceptions(
    staffId: string,
    actor: AuthenticatedUser,
  ): Promise<AvailabilityException[]> {
    await this.locationAccess.assertCanAccessStaff(actor, staffId);
    return this.prisma.availabilityException.findMany({
      where: { staffId },
      orderBy: { date: 'asc' },
    });
  }

  async createException(
    staffId: string,
    dto: CreateAvailabilityExceptionDto,
    actor: AuthenticatedUser,
  ): Promise<AvailabilityException> {
    this.assertSelfServiceOrAdmin(staffId, actor);
    if (dto.startTime && dto.endTime) {
      this.assertTimeOrder(dto.startTime, dto.endTime);
    }

    const exception = await this.prisma.availabilityException.create({
      data: {
        staffId,
        date: new Date(dto.date),
        type: dto.type,
        startTime: dto.startTime,
        endTime: dto.endTime,
        reason: dto.reason,
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.AVAILABILITY_EXCEPTION,
      entityId: exception.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: exception,
    });

    return exception;
  }

  async deleteException(
    staffId: string,
    exceptionId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    this.assertSelfServiceOrAdmin(staffId, actor);
    const existing = await this.prisma.availabilityException.findFirst({
      where: { id: exceptionId, staffId },
    });
    if (!existing) {
      throw new NotFoundException('Availability exception not found');
    }

    await this.prisma.availabilityException.delete({ where: { id: exceptionId } });
    await this.audit.record({
      entityType: AuditEntityType.AVAILABILITY_EXCEPTION,
      entityId: exceptionId,
      action: AuditAction.DELETE,
      actorId: actor.id,
      beforeState: existing,
    });
  }

  /** Staff set their own availability; admins may act on their behalf. Managers are read-only. */
  private assertSelfServiceOrAdmin(staffId: string, actor: AuthenticatedUser): void {
    if (actor.role === Role.ADMIN || actor.id === staffId) return;
    throw new ForbiddenException('Only the staff member (or an admin) may edit availability');
  }

  private assertTimeOrder(startTime: string, endTime: string): void {
    if (startTime >= endTime) {
      throw new BadRequestException('startTime must be before endTime');
    }
  }

  private async getRuleOrThrow(staffId: string, ruleId: string): Promise<AvailabilityRule> {
    const rule = await this.prisma.availabilityRule.findFirst({
      where: { id: ruleId, staffId },
    });
    if (!rule) {
      throw new NotFoundException('Availability rule not found');
    }
    return rule;
  }
}
