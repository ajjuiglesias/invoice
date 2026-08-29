import { isWorkingDay } from './bank-holidays';
import { NOTICE_WORKING_DAYS } from './company';
import { rateItem } from './rate-card';
import type { Invoice, InvoiceLine } from './types';

/** Amount for one line, matching the template's ROUND(qty * price, 2). */
export function lineAmount(line: InvoiceLine): number {
  return round2(line.qty * line.unitPrice);
}

export function subtotal(lines: InvoiceLine[]): number {
  return round2(lines.reduce((sum, l) => sum + lineAmount(l), 0));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(n);
}

/** Sort lines into template row order so the spreadsheet reads top to bottom. */
export function sortLines(lines: InvoiceLine[]): InvoiceLine[] {
  return [...lines].sort(
    (a, b) => (rateItem(a.rateItemId)?.row ?? 0) - (rateItem(b.rateItemId)?.row ?? 0),
  );
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** yyyy-mm for a Date, in local time. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The yyyy-mm key one month on from the given one. */
export function nextMonth(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m, 1));
}

/** Human month, e.g. "August 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

/** ISO yyyy-mm-dd in local time (avoids the UTC shift of toISOString). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Display form, e.g. "27 August 2026". */
export function formatDate(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * The company requires invoices at least 5 working days before the last day of
 * the month. Returns that deadline date for the given yyyy-mm period.
 *
 * Weekends and England & Wales bank holidays are both skipped, so the date is
 * the genuine last working day rather than an optimistic one.
 */
export function submissionDeadline(periodMonth: string): Date {
  const [y, m] = periodMonth.split('-').map(Number);
  const cursor = new Date(y, m, 0); // day 0 of next month === last day of this one
  let remaining = NOTICE_WORKING_DAYS;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    if (isWorkingDay(cursor)) remaining -= 1;
  }
  return cursor;
}

export type DeadlineStatus = 'ok' | 'due-soon' | 'late';

export function deadlineStatus(periodMonth: string, today = new Date()): {
  status: DeadlineStatus;
  deadline: Date;
  daysRemaining: number;
} {
  const deadline = submissionDeadline(periodMonth);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.round((deadline.getTime() - startOfToday.getTime()) / msPerDay);

  let status: DeadlineStatus = 'ok';
  if (daysRemaining < 0) status = 'late';
  else if (daysRemaining <= 3) status = 'due-soon';

  return { status, deadline, daysRemaining };
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

/**
 * Mirrors the company's own file naming, e.g. "Invoice August 2026 Ajju.xlsx".
 * Falls back to the full name when no business name is set.
 */
export function invoiceFileBase(invoice: Invoice): string {
  const who = invoice.profile.businessName.trim() || invoice.profile.fullName.trim() || 'Freelancer';
  const shortWho = who.split(/\s+/)[0];
  return `Invoice ${monthLabel(invoice.periodMonth)} ${shortWho}`.replace(/[\\/:*?"<>|]/g, '-');
}
