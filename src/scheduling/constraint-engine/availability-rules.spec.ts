import { describe, expect, it } from 'vitest';
import { isAvailableForSegments } from './availability-rules.js';
import type { LocalSegment } from './time-window.util.js';

const friday: LocalSegment = { date: '2026-09-04', dayOfWeek: 5, startMinutes: 9 * 60, endMinutes: 17 * 60 };

describe('isAvailableForSegments', () => {
  it('is available when a recurring rule fully covers the segment', () => {
    const ok = isAvailableForSegments(
      [friday],
      [{ dayOfWeek: 5, startTime: '08:00', endTime: '18:00', isActive: true }],
      [],
    );
    expect(ok).toBe(true);
  });

  it('is unavailable when no rule covers the day', () => {
    const ok = isAvailableForSegments(
      [friday],
      [{ dayOfWeek: 1, startTime: '08:00', endTime: '18:00', isActive: true }],
      [],
    );
    expect(ok).toBe(false);
  });

  it('is unavailable when the rule only partially covers the segment', () => {
    const ok = isAvailableForSegments(
      [friday],
      [{ dayOfWeek: 5, startTime: '10:00', endTime: '18:00', isActive: true }], // starts after segment start
      [],
    );
    expect(ok).toBe(false);
  });

  it('ignores inactive rules', () => {
    const ok = isAvailableForSegments(
      [friday],
      [{ dayOfWeek: 5, startTime: '08:00', endTime: '18:00', isActive: false }],
      [],
    );
    expect(ok).toBe(false);
  });

  it('an UNAVAILABLE exception blocks even when a rule would otherwise cover it', () => {
    const ok = isAvailableForSegments(
      [friday],
      [{ dayOfWeek: 5, startTime: '08:00', endTime: '18:00', isActive: true }],
      [{ date: '2026-09-04', type: 'UNAVAILABLE', startTime: null, endTime: null }],
    );
    expect(ok).toBe(false);
  });

  it('a partial UNAVAILABLE exception only blocks its own window', () => {
    const ok = isAvailableForSegments(
      [friday],
      [{ dayOfWeek: 5, startTime: '08:00', endTime: '18:00', isActive: true }],
      [{ date: '2026-09-04', type: 'UNAVAILABLE', startTime: '20:00', endTime: '22:00' }],
    );
    expect(ok).toBe(true);
  });

  it('an AVAILABLE exception grants access with no recurring rule needed', () => {
    const ok = isAvailableForSegments(
      [friday],
      [],
      [{ date: '2026-09-04', type: 'AVAILABLE', startTime: '09:00', endTime: '17:00' }],
    );
    expect(ok).toBe(true);
  });

  it('requires every segment of a multi-day (overnight) shift to be covered', () => {
    const overnightSegments: LocalSegment[] = [
      { date: '2026-09-04', dayOfWeek: 5, startMinutes: 23 * 60, endMinutes: 24 * 60 },
      { date: '2026-09-05', dayOfWeek: 6, startMinutes: 0, endMinutes: 3 * 60 },
    ];

    const onlyFirstDayCovered = isAvailableForSegments(
      overnightSegments,
      [{ dayOfWeek: 5, startTime: '20:00', endTime: '23:59', isActive: true }],
      [],
    );
    expect(onlyFirstDayCovered).toBe(false);

    const bothDaysCovered = isAvailableForSegments(
      overnightSegments,
      [
        { dayOfWeek: 5, startTime: '20:00', endTime: '23:59', isActive: true },
        { dayOfWeek: 6, startTime: '00:00', endTime: '05:00', isActive: true },
      ],
      [],
    );
    // "23:59" is treated as reaching through midnight, so two same-day rules
    // can express overnight availability across the split segments.
    expect(bothDaysCovered).toBe(true);
  });

  it('still rejects a rule that genuinely stops short of midnight', () => {
    const dayEndSegment: LocalSegment = { date: '2026-09-04', dayOfWeek: 5, startMinutes: 20 * 60, endMinutes: 24 * 60 };
    const ok = isAvailableForSegments(
      [dayEndSegment],
      [{ dayOfWeek: 5, startTime: '18:00', endTime: '22:00', isActive: true }],
      [],
    );
    expect(ok).toBe(false);
  });
});
