import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, AuditAction, AuditEntityType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';

const EARLY_CLOCK_IN_WINDOW_MINUTES = 15;

@Injectable()
export class TimeclockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async clockIn(shiftId: string, actor: AuthenticatedUser) {
    const assignment = await this.getAssignmentOrThrow(shiftId, actor.id);
    if (assignment.clockInAt) {
      throw new ConflictException('Already clocked in for this shift');
    }

    const earliestAllowed = new Date(
      assignment.shift.startAt.getTime() - EARLY_CLOCK_IN_WINDOW_MINUTES * 60_000,
    );
    const now = new Date();
    if (now < earliestAllowed || now > assignment.shift.endAt) {
      throw new BadRequestException(
        `Can only clock in within ${EARLY_CLOCK_IN_WINDOW_MINUTES} minutes of the shift starting, up until it ends`,
      );
    }

    const updated = await this.prisma.shiftAssignment.update({
      where: { id: assignment.id },
      data: { clockInAt: now },
    });

    await this.audit.record({
      entityType: AuditEntityType.SHIFT_ASSIGNMENT,
      entityId: assignment.id,
      action: AuditAction.CLOCK_IN,
      actorId: actor.id,
      afterState: updated,
      locationId: assignment.shift.locationId,
    });

    this.realtime.emitToLocation(assignment.shift.locationId, 'onduty.update', {
      locationId: assignment.shift.locationId,
    });

    return updated;
  }

  async clockOut(shiftId: string, actor: AuthenticatedUser) {
    const assignment = await this.getAssignmentOrThrow(shiftId, actor.id);
    if (!assignment.clockInAt) {
      throw new ConflictException('Not clocked in for this shift');
    }
    if (assignment.clockOutAt) {
      throw new ConflictException('Already clocked out for this shift');
    }

    const updated = await this.prisma.shiftAssignment.update({
      where: { id: assignment.id },
      data: { clockOutAt: new Date() },
    });

    await this.audit.record({
      entityType: AuditEntityType.SHIFT_ASSIGNMENT,
      entityId: assignment.id,
      action: AuditAction.CLOCK_OUT,
      actorId: actor.id,
      afterState: updated,
      locationId: assignment.shift.locationId,
    });

    this.realtime.emitToLocation(assignment.shift.locationId, 'onduty.update', {
      locationId: assignment.shift.locationId,
    });

    return updated;
  }

  async getOnDutyForLocation(locationId: string, actor: AuthenticatedUser) {
    if (actor.role === Role.MANAGER) {
      await this.locationAccess.assertManagerCanAccessLocation(actor, locationId);
    } else if (actor.role === Role.STAFF) {
      const certified = await this.prisma.staffLocation.findFirst({
        where: { staffId: actor.id, locationId, decertifiedAt: null },
      });
      if (!certified) {
        throw new BadRequestException('You are not certified at this location');
      }
    }

    return this.prisma.shiftAssignment.findMany({
      where: {
        status: AssignmentStatus.ASSIGNED,
        clockInAt: { not: null },
        clockOutAt: null,
        shift: { locationId },
      },
      include: {
        staff: { select: { id: true, firstName: true, lastName: true } },
        shift: { select: { id: true, startAt: true, endAt: true, requiredSkillId: true } },
      },
    });
  }

  private async getAssignmentOrThrow(shiftId: string, staffId: string) {
    const assignment = await this.prisma.shiftAssignment.findUnique({
      where: { shiftId_staffId: { shiftId, staffId } },
      include: { shift: true },
    });
    if (!assignment || assignment.status !== AssignmentStatus.ASSIGNED) {
      throw new NotFoundException('No active assignment found for this shift');
    }
    return assignment;
  }
}
