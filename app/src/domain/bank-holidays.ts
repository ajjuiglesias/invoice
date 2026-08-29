/**
 * England & Wales bank holidays, computed rather than listed.
 *
 * A hardcoded table goes stale silently — the app would keep working and
 * quietly give the wrong deadline. Every regular holiday is derivable, so we
 * derive them and stay correct for any year.
 *
 * Not covered: one-off holidays granted by royal proclamation (coronations,
 * jubilees). Those are rare, announced well in advance, and can be added to
 * EXTRA_HOLIDAYS below.
 */

/** One-off holidays that cannot be computed. Format: yyyy-mm-dd. */
const EXTRA_HOLIDAYS: string[] = [
  // e.g. '2023-05-08', // Coronation of King Charles III
];

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Easter Sunday, by the Anonymous Gregorian algorithm. */
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** The nth given weekday of a month. `nth` of -1 means the last one. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  if (nth > 0) {
    const first = new Date(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return new Date(year, month, 1 + offset + (nth - 1) * 7);
  }
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month, last.getDate() - offset);
}

/**
 * When a fixed-date holiday lands on a weekend it moves to the next working
 * day. Christmas and Boxing Day shift together, so an already-taken date
 * pushes the next one further along.
 */
function substitute(date: Date, taken: Set<string>): Date {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6 || taken.has(iso(d))) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

const cache = new Map<number, Set<string>>();

/** Every England & Wales bank holiday in a year, as yyyy-mm-dd. */
export function bankHolidays(year: number): Set<string> {
  const cached = cache.get(year);
  if (cached) return cached;

  const taken = new Set<string>();
  const add = (d: Date) => taken.add(iso(d));

  // Fixed dates, in calendar order, so Boxing Day sees Christmas's substitute.
  add(substitute(new Date(year, 0, 1), taken)); // New Year's Day

  const easter = easterSunday(year);

  const goodFriday = new Date(easter);
  goodFriday.setDate(goodFriday.getDate() - 2);
  add(goodFriday);

  const easterMonday = new Date(easter);
  easterMonday.setDate(easterMonday.getDate() + 1);
  add(easterMonday);

  add(nthWeekdayOfMonth(year, 4, 1, 1)); // Early May — first Monday in May
  add(nthWeekdayOfMonth(year, 4, 1, -1)); // Spring — last Monday in May
  add(nthWeekdayOfMonth(year, 7, 1, -1)); // Summer — last Monday in August

  const christmas = substitute(new Date(year, 11, 25), taken);
  add(christmas);
  add(substitute(new Date(year, 11, 26), taken)); // Boxing Day

  for (const extra of EXTRA_HOLIDAYS) {
    if (extra.startsWith(String(year))) taken.add(extra);
  }

  cache.set(year, taken);
  return taken;
}

export function isBankHoliday(date: Date): boolean {
  return bankHolidays(date.getFullYear()).has(iso(date));
}

/** Weekends and bank holidays are both non-working. */
export function isWorkingDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return !isBankHoliday(date);
}
