import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { addHours, subDays } from 'date-fns';
import { AssignmentStatus, OverrideType, Role, type Prisma, type Shift, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AppConfig } from '../../config/configuration.js';
import type { ConstraintCheckResult, StaffSuggestion } from '../../common/constraints/constraint.types.js';
import { isAvailableForSegments } from './availability-rules.js';
import { evaluateConstraints, type EvaluationInput } from './constraint-rules.js';
import { addDays, localDateOf, splitIntoLocalDaySegments, weekStartOf } from './time-window.util.js';

export type ShiftLike = Pick<Shift, 'id' | 'locationId' | 'requiredSkillId' | 'startAt' | 'endAt'>;

/** Either the app-wide PrismaService or an in-flight transaction client. */
export type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ConstraintEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Pass `db` as a transaction client (with the staff row already locked via
   * `SELECT ... FOR UPDATE`) when validating inside an assignment transaction,
   * so the re-check after acquiring the lock sees a consistent, serialized
   * view of that staff member's other assignments.
   */
  async evaluateAssignment(
    params: { staffId: string; shift: ShiftLike; excludeAssignmentId?: string },
    db: Db = this.prisma,
  ): Promise<ConstraintCheckResult> {
    const staff = await db.user.findUniqueOrThrow({ where: { id: params.staffId } });
    const input = await this.buildEvaluationInput(db, staff, params.shift, params.excludeAssignmentId);
    const violations = evaluateConstraints(input, this.rules);
    const hasBlock = violations.some((v) => v.severity === 'BLOCK');

    if (!hasBlock) {
      return { ok: true, violations };
    }

    const suggestions = await this.suggestAlternatives(params.shift, params.staffId);
    return { ok: false, violations, suggestions };
  }

  private get rules(): AppConfig['businessRules'] {
    return this.configService.get('businessRules', { infer: true });
  }

  private async buildEvaluationInput(
    db: Db,
    staff: User,
    shift: ShiftLike,
    excludeAssignmentId?: string,
  ): Promise<EvaluationInput> {
    const timezone = staff.homeTimezone;
    const segments = splitIntoLocalDaySegments(shift.startAt, shift.endAt, timezone);
    const candidateDate = segments[0].date;
    const candidateHours = (shift.endAt.getTime() - shift.startAt.getTime()) / 3_600_000;
    const weekStart = weekStartOf(candidateDate);
    const weekEnd = addDays(weekStart, 6);

    const [hasRequiredSkillRow, certification, rules, exceptions, windowAssignments, override] =
      await Promise.all([
        db.staffSkill.findUnique({
          where: { staffId_skillId: { staffId: staff.id, skillId: shift.requiredSkillId } },
        }),
        db.staffLocation.findUnique({
          where: { staffId_locationId: { staffId: staff.id, locationId: shift.locationId } },
        }),
        db.availabilityRule.findMany({ where: { staffId: staff.id, isActive: true } }),
        db.availabilityException.findMany({ where: { staffId: staff.id } }),
        this.fetchNearbyAssignments(db, staff.id, shift, excludeAssignmentId),
        db.scheduleOverride.findFirst({
          where: {
            staffId: staff.id,
            weekStartDate: new Date(`${weekStart}T00:00:00.000Z`),
            type: OverrideType.SEVENTH_CONSECUTIVE_DAY,
          },
        }),
      ]);

    const isAvailable = isAvailableForSegments(
      segments,
      rules,
      exceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        type: e.type,
        startTime: e.startTime,
        endTime: e.endTime,
      })),
    );

    let overlapsExistingShift = false;
    let restGapHours: number | null = null;
    let otherHoursOnCandidateDate = 0;
    let weeklyHoursBeforeCandidate = 0;
    const workedDates = new Set<string>();

    for (const assignment of windowAssignments) {
      const overlaps = assignment.startAt < shift.endAt && assignment.endAt > shift.startAt;
      const assignmentHours = (assignment.endAt.getTime() - assignment.startAt.getTime()) / 3_600_000;
      const assignmentDate = localDateOf(assignment.startAt, timezone);
      workedDates.add(assignmentDate);

      if (overlaps) {
        overlapsExistingShift = true;
      } else {
        const gapMs =
          assignment.endAt <= shift.startAt
            ? shift.startAt.getTime() - assignment.endAt.getTime()
            : assignment.startAt.getTime() - shift.endAt.getTime();
        const gapHours = gapMs / 3_600_000;
        if (restGapHours === null || gapHours < restGapHours) {
          restGapHours = gapHours;
        }
      }

      if (assignmentDate === candidateDate) {
        otherHoursOnCandidateDate += assignmentHours;
      }
      if (assignmentDate >= weekStart && assignmentDate <= weekEnd) {
        weeklyHoursBeforeCandidate += assignmentHours;
      }
    }

    let consecutiveDaysBeforeCandidate = 0;
    let cursor = addDays(candidateDate, -1);
    while (workedDates.has(cursor)) {
      consecutiveDaysBeforeCandidate++;
      cursor = addDays(cursor, -1);
    }

    return {
      staffName: `${staff.firstName} ${staff.lastName}`,
      hasRequiredSkill: !!hasRequiredSkillRow,
      isCertifiedForLocation: !!certification && !certification.decertifiedAt,
      isAvailable,
      overlapsExistingShift,
      restGapHours,
      candidateDate,
      candidateHours,
      otherHoursOnCandidateDate,
      weeklyHoursBeforeCandidate,
      consecutiveDaysBeforeCandidate,
      hasSeventhDayOverride: !!override,
    };
  }

  private async fetchNearbyAssignments(
    db: Db,
    staffId: string,
    shift: ShiftLike,
    excludeAssignmentId?: string,
  ): Promise<Array<{ startAt: Date; endAt: Date }>> {
    const windowStart = subDays(shift.startAt, 9);
    const windowEnd = addHours(shift.endAt, 48);

    const rows = await db.shiftAssignment.findMany({
      where: {
        staffId,
        status: AssignmentStatus.ASSIGNED,
        id: excludeAssignmentId ? { not: excludeAssignmentId } : undefined,
        shift: { startAt: { lt: windowEnd }, endAt: { gt: windowStart } },
      },
      include: { shift: { select: { startAt: true, endAt: true } } },
    });

    return rows.map((row) => ({ startAt: row.shift.startAt, endAt: row.shift.endAt }));
  }

  private async suggestAlternatives(
    shift: ShiftLike,
    excludeStaffId: string,
  ): Promise<StaffSuggestion[]> {
    const candidates = await this.prisma.user.findMany({
      where: {
        role: Role.STAFF,
        isActive: true,
        id: { not: excludeStaffId },
        staffSkills: { some: { skillId: shift.requiredSkillId } },
        staffLocations: { some: { locationId: shift.locationId, decertifiedAt: null } },
      },
      take: 25,
    });

    const scored: StaffSuggestion[] = [];
    for (const candidate of candidates) {
      const input = await this.buildEvaluationInput(this.prisma, candidate, shift);
      if (!input.isAvailable || input.overlapsExistingShift) continue;
      if (input.restGapHours !== null && input.restGapHours < this.rules.minRestHours) continue;

      scored.push({
        staffId: candidate.id,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        currentWeeklyHours: input.weeklyHoursBeforeCandidate,
      });
    }

    return scored.sort((a, b) => a.currentWeeklyHours - b.currentWeeklyHours).slice(0, 5);
  }
}
