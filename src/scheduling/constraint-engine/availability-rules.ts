import type { LocalSegment } from './time-window.util.js';
import { timeToMinutes } from './time-window.util.js';

export interface AvailabilityRuleData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface AvailabilityExceptionData {
  date: string;
  type: 'AVAILABLE' | 'UNAVAILABLE';
  startTime: string | null;
  endTime: string | null;
}

// "HH:mm" is the last minute of an inclusive window, e.g. "23:59" means "until
// midnight" — so its upper bound for range math is timeToMinutes + 1, not the
// literal minute value (which would fall one minute short of a day-end segment
// boundary of 1440 and make overnight availability impossible to express).
function inclusiveEndMinutes(hhmm: string): number {
  return timeToMinutes(hhmm) + 1;
}

function exceptionOverlapsSegment(exception: AvailabilityExceptionData, segment: LocalSegment): boolean {
  if (exception.date !== segment.date) return false;
  if (!exception.startTime || !exception.endTime) return true; // entire-day exception
  const excStart = timeToMinutes(exception.startTime);
  const excEnd = inclusiveEndMinutes(exception.endTime);
  return excStart < segment.endMinutes && excEnd > segment.startMinutes;
}

function exceptionCoversSegment(exception: AvailabilityExceptionData, segment: LocalSegment): boolean {
  if (exception.date !== segment.date) return false;
  if (!exception.startTime || !exception.endTime) return true;
  return (
    timeToMinutes(exception.startTime) <= segment.startMinutes &&
    inclusiveEndMinutes(exception.endTime) >= segment.endMinutes
  );
}

/**
 * True only if EVERY local-day segment of the candidate shift is covered by
 * an active recurring rule or an AVAILABLE exception, and none of it falls
 * inside an UNAVAILABLE exception window.
 */
export function isAvailableForSegments(
  segments: LocalSegment[],
  rules: AvailabilityRuleData[],
  exceptions: AvailabilityExceptionData[],
): boolean {
  return segments.every((segment) => {
    const blocked = exceptions.some(
      (e) => e.type === 'UNAVAILABLE' && exceptionOverlapsSegment(e, segment),
    );
    if (blocked) return false;

    const explicitlyAvailable = exceptions.some(
      (e) => e.type === 'AVAILABLE' && exceptionCoversSegment(e, segment),
    );
    if (explicitlyAvailable) return true;

    return rules.some(
      (rule) =>
        rule.isActive &&
        rule.dayOfWeek === segment.dayOfWeek &&
        timeToMinutes(rule.startTime) <= segment.startMinutes &&
        inclusiveEndMinutes(rule.endTime) >= segment.endMinutes,
    );
  });
}
