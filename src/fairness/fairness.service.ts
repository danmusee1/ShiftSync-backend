import { ForbiddenException, Injectable } from '@nestjs/common';
import { AssignmentStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationAccessService } from '../access/location-access.service.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { localDateOf } from '../scheduling/constraint-engine/time-window.util.js';

export interface HoursDistributionEntry {
  staffId: string;
  firstName: string;
  lastName: string;
  totalHours: number;
  shiftCount: number;
}

export interface PremiumFairnessEntry {
  staffId: string;
  firstName: string;
  lastName: string;
  totalShifts: number;
  premiumShifts: number;
  premiumRatio: number;
  /** 1.0 = exactly matches the team average premium-shift ratio; lower = further off (either direction). */
  fairnessScore: number;
}

export interface DesiredHoursEntry {
  staffId: string;
  firstName: string;
  lastName: string;
  desiredWeeklyHours: number | null;
  actualWeeklyHours: number;
  deltaHours: number | null;
}

// "Desirable shift" per the spec: Friday/Saturday evenings — defined here as
// a local start hour of 17:00 or later, in the shift's own location timezone.
const PREMIUM_DAYS_OF_WEEK = new Set([5, 6]); // Friday, Saturday
const PREMIUM_START_HOUR = 17;

@Injectable()
export class FairnessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationAccess: LocationAccessService,
    private readonly complianceService: ComplianceService,
  ) {}

  async getHoursDistribution(
    from: string,
    to: string,
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<HoursDistributionEntry[]> {
    const staffIds = await this.resolveStaffScope(actor, locationId);
    if (staffIds.length === 0) return [];

    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        staffId: { in: staffIds },
        status: AssignmentStatus.ASSIGNED,
        shift: { startAt: { gte: new Date(from), lt: new Date(to) } },
      },
      include: { shift: true, staff: true },
    });

    const byStaff = new Map<string, HoursDistributionEntry>();
    for (const { shift, staff } of assignments) {
      const entry = byStaff.get(staff.id) ?? {
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        totalHours: 0,
        shiftCount: 0,
      };
      entry.totalHours += (shift.endAt.getTime() - shift.startAt.getTime()) / 3_600_000;
      entry.shiftCount += 1;
      byStaff.set(staff.id, entry);
    }

    return [...byStaff.values()].sort((a, b) => b.totalHours - a.totalHours);
  }

  async getPremiumShiftFairness(
    from: string,
    to: string,
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<PremiumFairnessEntry[]> {
    const staffIds = await this.resolveStaffScope(actor, locationId);
    if (staffIds.length === 0) return [];

    const assignments = await this.prisma.shiftAssignment.findMany({
      where: {
        staffId: { in: staffIds },
        status: AssignmentStatus.ASSIGNED,
        shift: { startAt: { gte: new Date(from), lt: new Date(to) } },
      },
      include: { shift: { include: { location: true } }, staff: true },
    });

    const byStaff = new Map<
      string,
      { staffId: string; firstName: string; lastName: string; totalShifts: number; premiumShifts: number }
    >();

    for (const { shift, staff } of assignments) {
      const entry = byStaff.get(staff.id) ?? {
        staffId: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        totalShifts: 0,
        premiumShifts: 0,
      };
      entry.totalShifts += 1;
      if (this.isPremiumShift(shift.startAt, shift.location.timezone)) {
        entry.premiumShifts += 1;
      }
      byStaff.set(staff.id, entry);
    }

    const entries = [...byStaff.values()];
    const teamTotalShifts = entries.reduce((sum, e) => sum + e.totalShifts, 0);
    const teamPremiumShifts = entries.reduce((sum, e) => sum + e.premiumShifts, 0);
    const teamAverageRatio = teamTotalShifts > 0 ? teamPremiumShifts / teamTotalShifts : 0;

    return entries
      .map((entry) => {
        const premiumRatio = entry.totalShifts > 0 ? entry.premiumShifts / entry.totalShifts : 0;
        return {
          ...entry,
          premiumRatio,
          fairnessScore: 1 - Math.min(1, Math.abs(premiumRatio - teamAverageRatio)),
        };
      })
      .sort((a, b) => a.fairnessScore - b.fairnessScore);
  }

  async getDesiredHoursComparison(
    weekStartDate: string,
    actor: AuthenticatedUser,
    locationId?: string,
  ): Promise<DesiredHoursEntry[]> {
    const weeklyHours = await this.complianceService.getWeeklyOvertimeReport(
      weekStartDate,
      actor,
      locationId,
    );

    const staff = await this.prisma.user.findMany({
      where: { id: { in: weeklyHours.map((w) => w.staffId) } },
      select: { id: true, desiredWeeklyHours: true },
    });
    const desiredById = new Map(staff.map((s) => [s.id, s.desiredWeeklyHours]));

    return weeklyHours.map((w) => {
      const desiredWeeklyHours = desiredById.get(w.staffId) ?? null;
      return {
        staffId: w.staffId,
        firstName: w.firstName,
        lastName: w.lastName,
        desiredWeeklyHours,
        actualWeeklyHours: w.weeklyHours,
        deltaHours: desiredWeeklyHours === null ? null : w.weeklyHours - desiredWeeklyHours,
      };
    });
  }

  private isPremiumShift(startAt: Date, locationTimezone: string): boolean {
    const localDate = localDateOf(startAt, locationTimezone);
    const [year, month, day] = localDate.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    if (!PREMIUM_DAYS_OF_WEEK.has(dayOfWeek)) return false;

    const localHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: locationTimezone,
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(startAt),
    );
    return localHour >= PREMIUM_START_HOUR;
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
