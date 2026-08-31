import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssignmentStatus, Role } from '@prisma/client';
import { addDays, subDays } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import type { AppConfig } from '../config/configuration.js';
import { dayOfWeekFor, localDateOf } from '../scheduling/constraint-engine/time-window.util.js';

export interface WeeklyHoursAssignment {
  shiftId: string;
  locationId: string;
  startAt: Date;
  endAt: Date;
  hours: number;
  cumulativeHoursAfter: number;
}

export interface StaffWeeklyHours {
  staffId: string;
  firstName: string;
  lastName: string;
  weeklyHours: number;
  status: 'OK' | 'WARNING' | 'OVERTIME';
  projectedOvertimeHours: number;
  /** USD/hour, or null if this staff member has no rate on file. */
  hourlyRate: number | null;
  /** All null when hourlyRate is null — there's nothing to project a cost from. */
  regularCost: number | null;
  /** Just the extra half — what overtime is costing beyond the regular rate. */
  overtimePremium: number | null;
  totalCost: number | null;
  assignments: WeeklyHoursAssignment[];
}

/** Standard FLSA-style time-and-a-half assumption for hours beyond the
 * overtime threshold — not configurable today, since nothing in the business
 * rules config currently varies this per jurisdiction. */
const OVERTIME_PAY_MULTIPLIER = 1.5;

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationAccess: LocationAccessService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Per-staff hours for the Sun-Sat week starting `weekStartDate`, bucketed
   * in each staff member's own homeTimezone — the same frame of reference
   * the constraint engine uses, so this dashboard never disagrees with what
   * actually blocked/warned an assignment.
   */
  async getWeeklyOvertimeReport(
    weekStartDate: string,
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<StaffWeeklyHours[]> {
    const staffIds = await this.resolveStaffScope(actor, locationId);
    if (staffIds.length === 0) return [];

    if (dayOfWeekFor(weekStartDate) !== 0) {
      throw new ForbiddenException('weekStartDate must be a Sunday');
    }

    // Wide UTC window so no local-timezone edge of the week is missed.
    const windowStart = subDays(new Date(`${weekStartDate}T00:00:00.000Z`), 1);
    const windowEnd = addDays(new Date(`${weekStartDate}T00:00:00.000Z`), 8);

    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        staffId: { in: staffIds },
        status: AssignmentStatus.ASSIGNED,
        shift: { startAt: { gte: windowStart, lt: windowEnd } },
      },
      include: { shift: true, staff: true },
      orderBy: { shift: { startAt: 'asc' } },
    });

    const rules = this.configService.get('businessRules', { infer: true });
    const byStaff = new Map<string, StaffWeeklyHours>();

    for (const assignment of assignments) {
      const { staff, shift } = assignment;
      const localDate = localDateOf(shift.startAt, staff.homeTimezone);
      if (!this.isInWeek(localDate, weekStartDate)) continue;

      const bucket = byStaff.get(staff.id) ?? {
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        weeklyHours: 0,
        status: 'OK' as const,
        projectedOvertimeHours: 0,
        hourlyRate: staff.hourlyRate,
        regularCost: null,
        overtimePremium: null,
        totalCost: null,
        assignments: [],
      };

      const hours = (shift.endAt.getTime() - shift.startAt.getTime()) / 3_600_000;
      bucket.weeklyHours += hours;
      bucket.assignments.push({
        shiftId: shift.id,
        locationId: shift.locationId,
        startAt: shift.startAt,
        endAt: shift.endAt,
        hours,
        cumulativeHoursAfter: bucket.weeklyHours,
      });

      byStaff.set(staff.id, bucket);
    }

    for (const bucket of byStaff.values()) {
      bucket.projectedOvertimeHours = Math.max(0, bucket.weeklyHours - rules.weeklyHoursOvertime);
      bucket.status =
        bucket.weeklyHours > rules.weeklyHoursOvertime
          ? 'OVERTIME'
          : bucket.weeklyHours > rules.weeklyHoursWarning
            ? 'WARNING'
            : 'OK';

      if (bucket.hourlyRate != null) {
        const regularHours = Math.min(bucket.weeklyHours, rules.weeklyHoursOvertime);
        const overtimeHours = bucket.projectedOvertimeHours;
        bucket.regularCost = regularHours * bucket.hourlyRate;
        bucket.overtimePremium = overtimeHours * bucket.hourlyRate * (OVERTIME_PAY_MULTIPLIER - 1);
        bucket.totalCost = bucket.regularCost + overtimeHours * bucket.hourlyRate * OVERTIME_PAY_MULTIPLIER;
      }
    }

    return [...byStaff.values()].sort((a, b) => b.weeklyHours - a.weeklyHours);
  }

  private isInWeek(localDate: string, weekStartDate: string): boolean {
    const start = new Date(`${weekStartDate}T00:00:00.000Z`);
    const end = addDays(start, 7);
    const date = new Date(`${localDate}T00:00:00.000Z`);
    return date >= start && date < end;
  }

  private async resolveStaffScope(
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<string[]> {
    if (locationId) {
      await this.locationAccess.assertManagerCanAccessLocation(actor, locationId);
      const rows = await this.prisma.staffLocation.findMany({
        where: { locationId, decertifiedAt: null },
        select: { staffId: true },
      });
      return rows.map((r) => r.staffId);
    }

    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Specify a locationId, or use an admin account for the company-wide view');
    }
    const rows = await this.prisma.user.findMany({
      where: { role: Role.STAFF, isActive: true },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }
}
