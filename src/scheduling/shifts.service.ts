import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AuditEntityType, type Shift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { CreateShiftDto } from './dto/create-shift.dto.js';
import { UpdateShiftDto } from './dto/update-shift.dto.js';
import { assertEditableOrThrow } from './edit-cutoff.util.js';
import { ScheduleWeeksService } from './schedule-weeks.service.js';

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
    private readonly scheduleWeeks: ScheduleWeeksService,
  ) {}

  async create(scheduleWeekId: string, dto: CreateShiftDto, actor: AuthenticatedUser): Promise<Shift> {
    const week = await this.scheduleWeeks.getOrThrow(scheduleWeekId);
    await this.locationAccess.assertManagerCanAccessLocation(actor, week.locationId);

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (startAt >= endAt) {
      throw new BadRequestException('startAt must be before endAt');
    }

    assertEditableOrThrow({
      isPublished: week.isPublished,
      publishCutoffHours: week.publishCutoffHours,
      earliestAffectedStart: startAt,
    });

    const shift = await this.prisma.shift.create({
      data: {
        scheduleWeekId,
        locationId: week.locationId,
        startAt,
        endAt,
        requiredSkillId: dto.requiredSkillId,
        headcountNeeded: dto.headcountNeeded ?? 1,
        notes: dto.notes,
        createdById: actor.id,
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.SHIFT,
      entityId: shift.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: shift,
      locationId: week.locationId,
    });

    return shift;
  }

  async findOne(id: string) {
    const shift = await this.prisma.shift.findUnique({
      where: { id },
      include: {
        requiredSkill: true,
        assignments: {
          where: { status: 'ASSIGNED' },
          include: { staff: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    return shift;
  }

  async update(id: string, dto: UpdateShiftDto, actor: AuthenticatedUser): Promise<Shift> {
    const before = await this.getShiftOrThrow(id);
    const week = await this.scheduleWeeks.getOrThrow(before.scheduleWeekId);
    await this.locationAccess.assertManagerCanAccessLocation(actor, week.locationId);

    const startAt = dto.startAt ? new Date(dto.startAt) : before.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : before.endAt;
    if (startAt >= endAt) {
      throw new BadRequestException('startAt must be before endAt');
    }

    const earliestAffectedStart = startAt < before.startAt ? startAt : before.startAt;
    assertEditableOrThrow({
      isPublished: week.isPublished,
      publishCutoffHours: week.publishCutoffHours,
      earliestAffectedStart,
    });

    const shift = await this.prisma.shift.update({
      where: { id },
      data: {
        startAt,
        endAt,
        requiredSkillId: dto.requiredSkillId,
        headcountNeeded: dto.headcountNeeded,
        notes: dto.notes,
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.SHIFT,
      entityId: id,
      action: AuditAction.UPDATE,
      actorId: actor.id,
      beforeState: before,
      afterState: shift,
      locationId: week.locationId,
    });

    return shift;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const before = await this.getShiftOrThrow(id);
    const week = await this.scheduleWeeks.getOrThrow(before.scheduleWeekId);
    await this.locationAccess.assertManagerCanAccessLocation(actor, week.locationId);

    assertEditableOrThrow({
      isPublished: week.isPublished,
      publishCutoffHours: week.publishCutoffHours,
      earliestAffectedStart: before.startAt,
    });

    await this.prisma.shift.delete({ where: { id } });

    await this.audit.record({
      entityType: AuditEntityType.SHIFT,
      entityId: id,
      action: AuditAction.DELETE,
      actorId: actor.id,
      beforeState: before,
      locationId: week.locationId,
    });
  }

  private async getShiftOrThrow(id: string): Promise<Shift> {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    return shift;
  }
}
