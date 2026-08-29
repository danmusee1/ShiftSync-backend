import type { ConstraintViolation } from '../../common/constraints/constraint.types.js';
import type { AppConfig } from '../../config/configuration.js';

export type BusinessRuleThresholds = AppConfig['businessRules'];

export interface EvaluationInput {
  staffName: string;
  hasRequiredSkill: boolean;
  isCertifiedForLocation: boolean;
  isAvailable: boolean;
  /** True if this candidate shift's time range overlaps another shift the staff is already assigned to. */
  overlapsExistingShift: boolean;
  /** Smallest gap (hours) to a non-overlapping adjacent shift, or null if none nearby. */
  restGapHours: number | null;
  /** Local calendar date (staff's homeTimezone) the candidate shift starts on. */
  candidateDate: string;
  candidateHours: number;
  /** Hours from the staff's OTHER assigned shifts falling on candidateDate. */
  otherHoursOnCandidateDate: number;
  /** Hours from the staff's OTHER assigned shifts in the same Sun–Sat week as candidateDate. */
  weeklyHoursBeforeCandidate: number;
  /** Consecutive worked days immediately preceding candidateDate (not including it). */
  consecutiveDaysBeforeCandidate: number;
  /** Whether a manager has already documented a 7th-consecutive-day override for this staff/week. */
  hasSeventhDayOverride: boolean;
}

/**
 * Pure rule evaluation — no I/O. All timezone-aware bucketing (local dates,
 * hours-per-day, consecutive-day streaks) happens in ConstraintEngineService
 * before calling this, so every rule here can be exercised with plain numbers.
 */
export function evaluateConstraints(
  input: EvaluationInput,
  rules: BusinessRuleThresholds,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (!input.hasRequiredSkill) {
    violations.push({
      rule: 'SKILL_MISMATCH',
      severity: 'BLOCK',
      message: `${input.staffName} does not have the skill required for this shift.`,
    });
  }

  if (!input.isCertifiedForLocation) {
    violations.push({
      rule: 'LOCATION_NOT_CERTIFIED',
      severity: 'BLOCK',
      message: `${input.staffName} is not certified to work at this location.`,
    });
  }

  if (!input.isAvailable) {
    violations.push({
      rule: 'UNAVAILABLE',
      severity: 'BLOCK',
      message: `${input.staffName} is not available during this shift's hours.`,
    });
  }

  if (input.overlapsExistingShift) {
    violations.push({
      rule: 'DOUBLE_BOOKED',
      severity: 'BLOCK',
      message: `${input.staffName} is already assigned to another shift that overlaps this one.`,
    });
  } else if (input.restGapHours !== null && input.restGapHours < rules.minRestHours) {
    violations.push({
      rule: 'MIN_REST_HOURS',
      severity: 'BLOCK',
      message: `${input.staffName} would have only ${input.restGapHours.toFixed(1)}h of rest against an adjacent shift; ${rules.minRestHours}h is required.`,
      context: { restGapHours: input.restGapHours },
    });
  }

  const totalDailyHours = input.otherHoursOnCandidateDate + input.candidateHours;
  if (totalDailyHours > rules.dailyHoursHardBlock) {
    violations.push({
      rule: 'DAILY_HOURS_HARD_BLOCK',
      severity: 'BLOCK',
      message: `This assignment would give ${input.staffName} ${totalDailyHours.toFixed(1)}h on ${input.candidateDate}, exceeding the ${rules.dailyHoursHardBlock}h hard daily limit.`,
      context: { totalDailyHours },
    });
  } else if (totalDailyHours > rules.dailyHoursWarning) {
    violations.push({
      rule: 'DAILY_HOURS_WARNING',
      severity: 'WARNING',
      message: `This assignment gives ${input.staffName} ${totalDailyHours.toFixed(1)}h on ${input.candidateDate}, above the ${rules.dailyHoursWarning}h warning threshold.`,
      context: { totalDailyHours },
    });
  }

  const totalWeeklyHours = input.weeklyHoursBeforeCandidate + input.candidateHours;
  if (totalWeeklyHours > rules.weeklyHoursOvertime) {
    violations.push({
      rule: 'WEEKLY_HOURS_OVERTIME',
      severity: 'WARNING',
      message: `This assignment pushes ${input.staffName} to ${totalWeeklyHours.toFixed(1)}h this week, over the ${rules.weeklyHoursOvertime}h overtime threshold.`,
      context: { totalWeeklyHours },
    });
  } else if (totalWeeklyHours > rules.weeklyHoursWarning) {
    violations.push({
      rule: 'WEEKLY_HOURS_WARNING',
      severity: 'WARNING',
      message: `This assignment brings ${input.staffName} to ${totalWeeklyHours.toFixed(1)}h this week, approaching the ${rules.weeklyHoursOvertime}h overtime threshold.`,
      context: { totalWeeklyHours },
    });
  }

  const consecutiveDaysIncludingCandidate = input.consecutiveDaysBeforeCandidate + 1;
  if (consecutiveDaysIncludingCandidate >= 7) {
    if (!input.hasSeventhDayOverride) {
      violations.push({
        rule: 'SEVENTH_CONSECUTIVE_DAY',
        severity: 'BLOCK',
        message: `This would be ${input.staffName}'s ${consecutiveDaysIncludingCandidate}th consecutive day worked, which requires a documented manager override.`,
        context: { consecutiveDays: consecutiveDaysIncludingCandidate },
      });
    }
  } else if (consecutiveDaysIncludingCandidate === 6) {
    violations.push({
      rule: 'SIXTH_CONSECUTIVE_DAY',
      severity: 'WARNING',
      message: `This would be ${input.staffName}'s 6th consecutive day worked.`,
      context: { consecutiveDays: consecutiveDaysIncludingCandidate },
    });
  }

  return violations;
}
