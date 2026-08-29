import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AssignmentStatus, AuditAction, AuditEntityType, type ShiftAssignment } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ConstraintViolationException } from '../common/exceptions/constraint-violation.exception.js';
import type { ConstraintViolation } from '../common/constraints/constraint.types.js';
import { ConstraintEngineService } from './constraint-engine/constraint-engine.service.js';
import { assertEditableOrThrow } from './edit-cutoff.util.js';
import { ScheduleWeeksService } from './schedule-weeks.service.js';

export interface AssignmentResult {
  assignment: ShiftAssignment;
  warnings: ConstraintViolation[];
}

@Injectable()
export class ShiftAssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly locationAccess: LocationAccessService,
    private readonly scheduleWeeks: ScheduleWeeksService,
    private readonly constraintEngine: ConstraintEngineService,
  ) {}

  async assign(
    shiftId: string,
    staffId: string,
    actor: AuthenticatedUser,
  ): Promise<AssignmentResult> {
    const shift = await this.getShiftOrThrow(shiftId);
    const week = await this.scheduleWeeks.getOrThrow(shift.scheduleWeekId);
    await this.locationAccess.assertManagerCanAccessLocation(actor, shift.locationId);

    assertEditableOrThrow({
      isPublished: week.isPublished,
      publishCutoffHours: week.publishCutoffHours,
      earliestAffectedStart: shift.startAt,
    });

    return this.prisma.$transaction(async (tx) => {
      // Serializes concurrent assignment attempts for this staff member (the
      // "two managers assign the same bartender at once" race) — the second
      // transaction blocks here until the first commits or rolls back, then
      // re-validates against the now-committed state instead of racing it.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${staffId} FOR UPDATE`;

      const existing = await tx.shiftAssignment.findUnique({
        where: { shiftId_staffId: { shiftId, staffId } },
      });

      if (existing?.status === AssignmentStatus.ASSIGNED) {
        throw new ConflictException('This staff member is already assigned to this shift');
      }

      const activeCount = await tx.shiftAssignment.count({
        where: { shiftId, status: AssignmentStatus.ASSIGNED },
      });
      if (activeCount >= shift.headcountNeeded) {
        throw new ConflictException('This shift is already fully staffed');
      }

      const result = await this.constraintEngine.evaluateAssignment(
        { staffId, shift, excludeAssignmentId: existing?.id },
        tx,
      );

      if (!result.ok) {
        throw new ConstraintViolationException(result.violations, result.suggestions);
      }

      const assignment = existing
        ? await tx.shiftAssignment.update({
            where: { id: existing.id },
            data: {
              status: AssignmentStatus.ASSIGNED,
              assignedById: actor.id,
              assignedAt: new Date(),
              cancelledAt: null,
            },
          })
        : await tx.shiftAssignment.create({
            data: { shiftId, staffId, assignedById: actor.id },
          });

      await this.audit.record(
        {
          entityType: AuditEntityType.SHIFT_ASSIGNMENT,
          entityId: assignment.id,
          action: AuditAction.ASSIGN,
          actorId: actor.id,
          beforeState: existing,
          afterState: assignment,
          locationId: shift.locationId,
        },
        tx,
      );

      return { assignment, warnings: result.violations };
    });
  }

  async unassign(shiftId: string, staffId: string, actor: AuthenticatedUser): Promise<void> {
    const shift = await this.getShiftOrThrow(shiftId);
    const week = await this.scheduleWeeks.getOrThrow(shift.scheduleWeekId);
    await this.locationAccess.assertManagerCanAccessLocation(actor, shift.locationId);

    assertEditableOrThrow({
      isPublished: week.isPublished,
      publishCutoffHours: week.publishCutoffHours,
      earliestAffectedStart: shift.startAt,
    });

    const existing = await this.prisma.shiftAssignment.findUnique({
      where: { shiftId_staffId: { shiftId, staffId } },
    });
    if (!existing || existing.status !== AssignmentStatus.ASSIGNED) {
      throw new NotFoundException('This staff member is not assigned to this shift');
    }

    const updated = await this.prisma.shiftAssignment.update({
      where: { id: existing.id },
      data: { status: AssignmentStatus.CANCELLED, cancelledAt: new Date() },
    });

    await this.audit.record({
      entityType: AuditEntityType.SHIFT_ASSIGNMENT,
      entityId: existing.id,
      action: AuditAction.UNASSIGN,
      actorId: actor.id,
      beforeState: existing,
      afterState: updated,
      locationId: shift.locationId,
    });
  }

  private async getShiftOrThrow(id: string) {
    const shift = await this.prisma.shift.findUnique({ where: { id } });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    return shift;
  }
}
