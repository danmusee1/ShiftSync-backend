import { describe, expect, it } from 'vitest';
import { localDateOf, splitIntoLocalDaySegments, weekStartOf } from './time-window.util.js';

describe('splitIntoLocalDaySegments', () => {
  it('keeps a same-day shift as a single segment', () => {
    const segments = splitIntoLocalDaySegments(
      new Date('2026-09-04T16:00:00Z'), // 09:00 America/Los_Angeles (PDT, UTC-7)
      new Date('2026-09-05T01:00:00Z'), // 18:00 America/Los_Angeles
      'America/Los_Angeles',
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ date: '2026-09-04', startMinutes: 9 * 60, endMinutes: 18 * 60 });
  });

  it('splits an overnight shift (11pm-3am) across two local calendar days', () => {
    // 23:00-03:00 America/New_York in early September is EDT (UTC-4).
    const segments = splitIntoLocalDaySegments(
      new Date('2026-09-05T03:00:00Z'), // 23:00 on 2026-09-04
      new Date('2026-09-05T07:00:00Z'), // 03:00 on 2026-09-05
      'America/New_York',
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ date: '2026-09-04', startMinutes: 23 * 60, endMinutes: 24 * 60 });
    expect(segments[1]).toMatchObject({ date: '2026-09-05', startMinutes: 0, endMinutes: 3 * 60 });
  });

  it('assigns the correct day-of-week per segment', () => {
    const segments = splitIntoLocalDaySegments(
      new Date('2026-09-04T16:00:00Z'),
      new Date('2026-09-05T01:00:00Z'),
      'America/Los_Angeles',
    );
    // 2026-09-04 is a Friday.
    expect(segments[0].dayOfWeek).toBe(5);
  });
});

describe('localDateOf', () => {
  it('reports different calendar dates for the same instant in different timezones', () => {
    const instant = new Date('2026-09-05T02:30:00Z');
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-09-04');
    expect(localDateOf(instant, 'UTC')).toBe('2026-09-05');
  });
});

describe('weekStartOf', () => {
  it('returns the same date when given a Sunday', () => {
    expect(weekStartOf('2026-08-30')).toBe('2026-08-30');
  });

  it('returns the preceding Sunday for a mid-week date', () => {
    expect(weekStartOf('2026-09-04')).toBe('2026-08-30');
  });
});
