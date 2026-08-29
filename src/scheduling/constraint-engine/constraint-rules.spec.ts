import { describe, expect, it } from 'vitest';
import { evaluateConstraints, type EvaluationInput } from './constraint-rules.js';
import type { BusinessRuleThresholds } from './constraint-rules.js';

const rules: BusinessRuleThresholds = {
  defaultPublishCutoffHours: 48,
  minRestHours: 10,
  dailyHoursWarning: 8,
  dailyHoursHardBlock: 12,
  weeklyHoursWarning: 35,
  weeklyHoursOvertime: 40,
  dropRequestExpiryHoursBeforeShift: 24,
  maxPendingSwapRequestsPerStaff: 3,
};

function baseInput(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    staffName: 'Jane Doe',
    hasRequiredSkill: true,
    isCertifiedForLocation: true,
    isAvailable: true,
    overlapsExistingShift: false,
    restGapHours: null,
    candidateDate: '2026-09-04',
    candidateHours: 8,
    otherHoursOnCandidateDate: 0,
    weeklyHoursBeforeCandidate: 0,
    consecutiveDaysBeforeCandidate: 0,
    hasSeventhDayOverride: false,
    ...overrides,
  };
}

function rulesOf(violations: ReturnType<typeof evaluateConstraints>): string[] {
  return violations.map((v) => v.rule);
}

describe('evaluateConstraints', () => {
  it('returns no violations for a fully valid assignment', () => {
    expect(evaluateConstraints(baseInput(), rules)).toEqual([]);
  });

  it('flags a skill mismatch', () => {
    const violations = evaluateConstraints(baseInput({ hasRequiredSkill: false }), rules);
    expect(rulesOf(violations)).toContain('SKILL_MISMATCH');
    expect(violations[0].severity).toBe('BLOCK');
  });

  it('flags an uncertified location', () => {
    const violations = evaluateConstraints(baseInput({ isCertifiedForLocation: false }), rules);
    expect(rulesOf(violations)).toContain('LOCATION_NOT_CERTIFIED');
  });

  it('flags unavailability', () => {
    const violations = evaluateConstraints(baseInput({ isAvailable: false }), rules);
    expect(rulesOf(violations)).toContain('UNAVAILABLE');
  });

  it('flags double-booking and skips the rest-hours check entirely', () => {
    const violations = evaluateConstraints(
      baseInput({ overlapsExistingShift: true, restGapHours: 2 }),
      rules,
    );
    expect(rulesOf(violations)).toEqual(['DOUBLE_BOOKED']);
  });

  it('blocks when rest gap is under the 10h minimum', () => {
    const violations = evaluateConstraints(baseInput({ restGapHours: 9.9 }), rules);
    expect(rulesOf(violations)).toContain('MIN_REST_HOURS');
  });

  it('allows exactly the minimum rest gap', () => {
    const violations = evaluateConstraints(baseInput({ restGapHours: 10 }), rules);
    expect(rulesOf(violations)).not.toContain('MIN_REST_HOURS');
  });

  it('warns above 8 daily hours but blocks above 12', () => {
    const warning = evaluateConstraints(
      baseInput({ candidateHours: 9, otherHoursOnCandidateDate: 0 }),
      rules,
    );
    expect(rulesOf(warning)).toContain('DAILY_HOURS_WARNING');
    expect(rulesOf(warning)).not.toContain('DAILY_HOURS_HARD_BLOCK');

    const blocked = evaluateConstraints(
      baseInput({ candidateHours: 5, otherHoursOnCandidateDate: 8 }),
      rules,
    );
    expect(rulesOf(blocked)).toContain('DAILY_HOURS_HARD_BLOCK');
  });

  it('does not warn at exactly 8 daily hours', () => {
    const violations = evaluateConstraints(baseInput({ candidateHours: 8 }), rules);
    expect(rulesOf(violations)).not.toContain('DAILY_HOURS_WARNING');
  });

  it('warns approaching 40 weekly hours and flags overtime past it', () => {
    const warning = evaluateConstraints(
      baseInput({ weeklyHoursBeforeCandidate: 28, candidateHours: 8 }),
      rules,
    );
    expect(rulesOf(warning)).toContain('WEEKLY_HOURS_WARNING');
    expect(rulesOf(warning)).not.toContain('WEEKLY_HOURS_OVERTIME');

    const overtime = evaluateConstraints(
      baseInput({ weeklyHoursBeforeCandidate: 36, candidateHours: 8 }),
      rules,
    );
    expect(rulesOf(overtime)).toContain('WEEKLY_HOURS_OVERTIME');
    expect(rulesOf(overtime)).not.toContain('WEEKLY_HOURS_WARNING');
  });

  it('warns on the 6th consecutive day', () => {
    const violations = evaluateConstraints(baseInput({ consecutiveDaysBeforeCandidate: 5 }), rules);
    expect(rulesOf(violations)).toContain('SIXTH_CONSECUTIVE_DAY');
  });

  it('blocks the 7th consecutive day without a documented override', () => {
    const violations = evaluateConstraints(baseInput({ consecutiveDaysBeforeCandidate: 6 }), rules);
    expect(rulesOf(violations)).toContain('SEVENTH_CONSECUTIVE_DAY');
  });

  it('allows the 7th consecutive day once a manager override is documented', () => {
    const violations = evaluateConstraints(
      baseInput({ consecutiveDaysBeforeCandidate: 6, hasSeventhDayOverride: true }),
      rules,
    );
    expect(rulesOf(violations)).not.toContain('SEVENTH_CONSECUTIVE_DAY');
  });

  it('an override recorded for the week also covers an 8th consecutive day in that same week', () => {
    // ScheduleOverride is keyed per staff/week (not per exact day count), so a
    // manager's one documented override authorizes the whole week running long.
    const violations = evaluateConstraints(
      baseInput({ consecutiveDaysBeforeCandidate: 7, hasSeventhDayOverride: true }),
      rules,
    );
    expect(rulesOf(violations)).not.toContain('SEVENTH_CONSECUTIVE_DAY');
  });

  it('can report multiple simultaneous violations', () => {
    const violations = evaluateConstraints(
      baseInput({ hasRequiredSkill: false, isCertifiedForLocation: false, isAvailable: false }),
      rules,
    );
    expect(rulesOf(violations)).toEqual(
      expect.arrayContaining(['SKILL_MISMATCH', 'LOCATION_NOT_CERTIFIED', 'UNAVAILABLE']),
    );
  });
});
