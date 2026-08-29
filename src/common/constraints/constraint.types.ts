export type ConstraintRule =
  | 'SKILL_MISMATCH'
  | 'LOCATION_NOT_CERTIFIED'
  | 'UNAVAILABLE'
  | 'DOUBLE_BOOKED'
  | 'MIN_REST_HOURS'
  | 'DAILY_HOURS_WARNING'
  | 'DAILY_HOURS_HARD_BLOCK'
  | 'WEEKLY_HOURS_WARNING'
  | 'WEEKLY_HOURS_OVERTIME'
  | 'SIXTH_CONSECUTIVE_DAY'
  | 'SEVENTH_CONSECUTIVE_DAY'
  | 'ALREADY_ASSIGNED_ELSEWHERE';

export type ConstraintSeverity = 'WARNING' | 'BLOCK';

export interface ConstraintViolation {
  rule: ConstraintRule;
  severity: ConstraintSeverity;
  message: string;
  context?: Record<string, unknown>;
}

export interface StaffSuggestion {
  staffId: string;
  firstName: string;
  lastName: string;
  currentWeeklyHours: number;
}

export interface ConstraintCheckResult {
  ok: boolean;
  violations: ConstraintViolation[];
  suggestions?: StaffSuggestion[];
}
