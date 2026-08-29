import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, AuditEntityType, Role, type ScheduleWeek } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import type { AppConfig } from '../config/configuration.js';
import { dayOfWeekFor } from './constraint-engine/time-window.util.js';
import { CreateScheduleWeekDto } from './dto/create-schedule-week.dto.js';
import { assertEditableOrThrow } from './edit-cutoff.util.js';

@Injectable()
export class ScheduleWeeksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async getOrCreate(
    locationId: string,
    dto: CreateScheduleWeekDto,
    actor: AuthenticatedUser,
  ): Promise<ScheduleWeek> {
    await this.locationAccess.assertManagerCanAccessLocation(actor, locationId);

    const weekStartDate = dto.weekStartDate.slice(0, 10);
    if (dayOfWeekFor(weekStartDate) !== 0) {
      throw new BadRequestException('weekStartDate must be a Sunday');
    }

    const existing = await this.prisma.scheduleWeek.findUnique({
      where: { locationId_weekStartDate: { locationId, weekStartDate: new Date(weekStartDate) } },
    });
    if (existing) return existing;

    const scheduleWeek = await this.prisma.scheduleWeek.create({
      data: {
        locationId,
        weekStartDate: new Date(weekStartDate),
        publishCutoffHours:
          dto.publishCutoffHours ??
          this.configService.get('businessRules.defaultPublishCutoffHours', { infer: true }),
      },
    });

    await this.audit.record({
      entityType: AuditEntityType.SCHEDULE_WEEK,
      entityId: scheduleWeek.id,
      action: AuditAction.CREATE,
      actorId: actor.id,
      afterState: scheduleWeek,
      locationId,
    });

    return scheduleWeek;
  }

  async findAllForLocation(locationId: string, actor: AuthenticatedUser): Promise<ScheduleWeek[]> {
    if (actor.role === Role.MANAGER) {
      await this.locationAccess.assertManagerCanAccessLocation(actor, locationId);
    } else if (actor.role === Role.STAFF) {
      const certified = await this.prisma.staffLocation.findFirst({
        where: { staffId: actor.id, locationId, decertifiedAt: null },
      });
      if (!certified) {
        throw new ForbiddenException('You are not certified at this location');
      }
    }

    return this.prisma.scheduleWeek.findMany({
      where: { locationId, isPublished: actor.role === Role.STAFF ? true : undefined },
      orderBy: { weekStartDate: 'desc' },
    });
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    await this.assertCanView(id, actor);

    const week = await this.prisma.scheduleWeek.findUnique({
      where: { id },
      include: {
        shifts: {
          include: {
            requiredSkill: true,
            assignments: {
              where: { status: 'ASSIGNED' },
              include: {
                staff: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
          orderBy: { startAt: 'asc' },
        },
      },
    });
    if (!week) {
      throw new NotFoundException('Schedule week not found');
    }
    return week;
  }

  async publish(id: string, actor: AuthenticatedUser): Promise<ScheduleWeek> {
    const week = await this.getOrThrow(id);
    await this.locationAccess.assertManagerCanAccessLocation(actor, week.locationId);

    const updated = await this.prisma.scheduleWeek.update({
      where: { id },
      data: { isPublished: true, publishedAt: new Date() },
    });

    await this.audit.record({
      entityType: AuditEntityType.SCHEDULE_WEEK,
      entityId: id,
      action: AuditAction.PUBLISH,
      actorId: actor.id,
      beforeState: week,
      afterState: updated,
      locationId: week.locationId,
    });

    return updated;
  }

  async unpublish(id: string, actor: AuthenticatedUser): Promise<ScheduleWeek> {
    const week = await this.getOrThrow(id);
    await this.locationAccess.assertManagerCanAccessLocation(actor, week.locationId);

    const earliestShift = await this.prisma.shift.findFirst({
      where: { scheduleWeekId: id },
      orderBy: { startAt: 'asc' },
    });

    if (earliestShift) {
      assertEditableOrThrow({
        isPublished: week.isPublished,
        publishCutoffHours: week.publishCutoffHours,
        earliestAffectedStart: earliestShift.startAt,
      });
    }

    const updated = await this.prisma.scheduleWeek.update({
      where: { id },
      data: { isPublished: false, publishedAt: null },
    });

    await this.audit.record({
      entityType: AuditEntityType.SCHEDULE_WEEK,
      entityId: id,
      action: AuditAction.UNPUBLISH,
      actorId: actor.id,
      beforeState: week,
      afterState: updated,
      locationId: week.locationId,
    });

    return updated;
  }

  async getOrThrow(id: string): Promise<ScheduleWeek> {
    const week = await this.prisma.scheduleWeek.findUnique({ where: { id } });
    if (!week) {
      throw new NotFoundException('Schedule week not found');
    }
    return week;
  }

  /** Admins see everything; managers need location access; staff only see published weeks for a location they're certified at. */
  private async assertCanView(id: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.role === Role.ADMIN) return;

    const week = await this.getOrThrow(id);

    if (actor.role === Role.MANAGER) {
      await this.locationAccess.assertManagerCanAccessLocation(actor, week.locationId);
      return;
    }

    if (!week.isPublished) {
      throw new ForbiddenException('This schedule has not been published yet');
    }
    const certified = await this.prisma.staffLocation.findFirst({
      where: { staffId: actor.id, locationId: week.locationId, decertifiedAt: null },
    });
    if (!certified) {
      throw new ForbiddenException('You are not certified at this location');
    }
  }
}
