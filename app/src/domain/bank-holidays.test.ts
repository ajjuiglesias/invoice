import { describe, expect, it } from 'vitest';
import { bankHolidays, isBankHoliday, isWorkingDay } from './bank-holidays';
import { isoDate, submissionDeadline } from './invoice';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

describe('bankHolidays', () => {
  it('produces the eight regular England & Wales holidays', () => {
    expect(bankHolidays(2026).size).toBe(8);
    expect(bankHolidays(2027).size).toBe(8);
  });

  it('matches the published 2026 dates', () => {
    // Easter Sunday 2026 is 5 April, so Good Friday is the 3rd.
    // Boxing Day falls on a Saturday, so it moves to Monday the 28th.
    expect([...bankHolidays(2026)].sort()).toEqual([
      '2026-01-01', // New Year's Day, Thursday
      '2026-04-03', // Good Friday
      '2026-04-06', // Easter Monday
      '2026-05-04', // Early May, first Monday
      '2026-05-25', // Spring, last Monday
      '2026-08-31', // Summer, last Monday
      '2026-12-25', // Christmas Day, Friday
      '2026-12-28', // Boxing Day substitute
    ]);
  });

  it('matches the published 2027 dates', () => {
    // Easter Sunday 2027 is 28 March. Christmas falls on a Saturday and Boxing
    // Day on a Sunday, so they move to the Monday and Tuesday.
    expect([...bankHolidays(2027)].sort()).toEqual([
      '2027-01-01', // New Year's Day, Friday
      '2027-03-26', // Good Friday
      '2027-03-29', // Easter Monday
      '2027-05-03', // Early May
      '2027-05-31', // Spring
      '2027-08-30', // Summer
      '2027-12-27', // Christmas Day substitute
      '2027-12-28', // Boxing Day substitute
    ]);
  });

  it('never lets Christmas and Boxing Day collapse onto one day', () => {
    for (let year = 2024; year <= 2040; year += 1) {
      const december = [...bankHolidays(year)].filter((day) => day.startsWith(`${year}-12`));
      expect(new Set(december).size).toBe(december.length);
      expect(december).toHaveLength(2);
    }
  });

  it('never places a substitute holiday on a weekend', () => {
    for (let year = 2024; year <= 2040; year += 1) {
      for (const day of bankHolidays(year)) {
        const weekday = new Date(`${day}T12:00:00`).getDay();
        // Good Friday and Easter Monday are always weekdays too.
        expect(weekday).toBeGreaterThan(0);
        expect(weekday).toBeLessThan(6);
      }
    }
  });

  it('moves New Year to Monday when it lands on a weekend', () => {
    // 1 January 2028 is a Saturday.
    expect(bankHolidays(2028).has('2028-01-03')).toBe(true);
    expect(bankHolidays(2028).has('2028-01-01')).toBe(false);
  });
});

describe('isWorkingDay', () => {
  it('excludes weekends', () => {
    expect(isWorkingDay(d(2026, 8, 29))).toBe(false); // Saturday
    expect(isWorkingDay(d(2026, 8, 30))).toBe(false); // Sunday
  });

  it('excludes bank holidays', () => {
    expect(isBankHoliday(d(2026, 8, 31))).toBe(true); // Summer bank holiday
    expect(isWorkingDay(d(2026, 8, 31))).toBe(false);
  });

  it('accepts ordinary weekdays', () => {
    expect(isWorkingDay(d(2026, 8, 27))).toBe(true);
  });
});

describe('submissionDeadline with bank holidays', () => {
  it('is unchanged for months with no holidays in the final week', () => {
    expect(isoDate(submissionDeadline('2026-08'))).toBe('2026-08-24');
    expect(isoDate(submissionDeadline('2026-09'))).toBe('2026-09-23');
  });

  it('skips Christmas and Boxing Day in December', () => {
    // December 2026 ends Thursday the 31st. Working back: Wed 30, Tue 29,
    // then Mon 28 is the Boxing Day substitute and Fri 25 is Christmas —
    // both skipped — so Thu 24, Wed 23, Tue 22.
    expect(isoDate(submissionDeadline('2026-12'))).toBe('2026-12-22');
  });

  it('skips the spring bank holiday in May', () => {
    // May 2027 ends Monday the 31st, which is the spring bank holiday.
    // Working back: Fri 28, Thu 27, Wed 26, Tue 25, Mon 24.
    expect(isoDate(submissionDeadline('2027-05'))).toBe('2027-05-24');
  });

  it('always lands on a working day', () => {
    for (let year = 2026; year <= 2030; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        expect(isWorkingDay(submissionDeadline(key))).toBe(true);
      }
    }
  });

  it('is never later than it was when only weekends were skipped', () => {
    // Adding holidays can only push the deadline earlier, never later.
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, '0')}`;
      const withHolidays = submissionDeadline(key);
      const lastDay = new Date(2026, month, 0);
      expect(withHolidays.getTime()).toBeLessThan(lastDay.getTime());
    }
  });
});
