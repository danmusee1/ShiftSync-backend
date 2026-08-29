import { formatInTimeZone } from 'date-fns-tz';

export interface LocalSegment {
  /** YYYY-MM-DD calendar date in the target timezone. */
  date: string;
  /** 0 = Sunday .. 6 = Saturday, for `date`. */
  dayOfWeek: number;
  /** Minutes since local midnight (0-1440). */
  startMinutes: number;
  endMinutes: number;
}

function localParts(instant: Date, timeZone: string): { date: string; hour: number; minute: number } {
  const formatted = formatInTimeZone(instant, timeZone, 'yyyy-MM-dd HH:mm');
  const [date, time] = formatted.split(' ');
  const [hour, minute] = time.split(':').map(Number);
  return { date, hour, minute };
}

function dayOfWeekFor(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Splits a UTC [startAt, endAt) instant range into per-local-calendar-day
 * segments in `timeZone`, so an overnight shift (e.g. 11pm-3am) yields two
 * segments instead of being force-fit into one calendar day.
 */
export function splitIntoLocalDaySegments(
  startAt: Date,
  endAt: Date,
  timeZone: string,
): LocalSegment[] {
  const start = localParts(startAt, timeZone);
  const end = localParts(endAt, timeZone);

  const segments: LocalSegment[] = [];
  let cursor = start.date;

  while (cursor <= end.date) {
    const isFirst = cursor === start.date;
    const isLast = cursor === end.date;
    segments.push({
      date: cursor,
      dayOfWeek: dayOfWeekFor(cursor),
      startMinutes: isFirst ? start.hour * 60 + start.minute : 0,
      endMinutes: isLast ? end.hour * 60 + end.minute : 24 * 60,
    });
    if (isLast) break;
    cursor = addDays(cursor, 1);
  }

  return segments;
}

/** Local calendar date (YYYY-MM-DD) a UTC instant falls on in `timeZone`. */
export function localDateOf(instant: Date, timeZone: string): string {
  return localParts(instant, timeZone).date;
}

export function timeToMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(':').map(Number);
  return hour * 60 + minute;
}

/** The Sunday (as YYYY-MM-DD) starting the calendar week containing `date`. */
export function weekStartOf(date: string): string {
  return addDays(date, -dayOfWeekFor(date));
}

export { addDays, dayOfWeekFor };
