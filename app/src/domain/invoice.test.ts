import { describe, expect, it } from 'vitest';
import {
  deadlineStatus,
  formatDate,
  invoiceFileBase,
  isoDate,
  lineAmount,
  monthKey,
  monthLabel,
  parseIsoDate,
  round2,
  sortLines,
  submissionDeadline,
  subtotal,
} from './invoice';
import type { Invoice, InvoiceLine } from './types';

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  key: 'k',
  rateItemId: 'blog-new',
  qty: 1,
  unitPrice: 80,
  asanaLinks: [],
  pageLinks: [],
  ...over,
});

describe('money', () => {
  it('rounds to two places', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(35)).toBe(35);
  });

  it('multiplies quantity by unit price like the template does', () => {
    expect(lineAmount(line({ qty: 2, unitPrice: 80 }))).toBe(160);
    expect(lineAmount(line({ qty: 3, unitPrice: 12.5 }))).toBe(37.5);
  });

  it('sums lines without floating point drift', () => {
    const total = subtotal([
      line({ key: 'a', qty: 1, unitPrice: 0.1 }),
      line({ key: 'b', qty: 1, unitPrice: 0.2 }),
    ]);
    expect(total).toBe(0.3);
  });

  it('totals the real August invoice correctly', () => {
    const total = subtotal([
      line({ key: 'a', rateItemId: 'act-end-new', qty: 1, unitPrice: 35 }),
      line({ key: 'b', rateItemId: 'blog-new', qty: 2, unitPrice: 80 }),
      line({ key: 'c', rateItemId: 'blog-edit', qty: 1, unitPrice: 20 }),
    ]);
    expect(total).toBe(215);
  });

  it('treats an empty invoice as zero', () => {
    expect(subtotal([])).toBe(0);
  });
});

describe('sortLines', () => {
  it('orders lines by their template row, not insertion order', () => {
    const sorted = sortLines([
      line({ key: 'pinterest', rateItemId: 'pinterest-5-pins' }), // row 46
      line({ key: 'actend', rateItemId: 'act-end-new' }), // row 19
      line({ key: 'blog', rateItemId: 'blog-new' }), // row 26
    ]);
    expect(sorted.map((l) => l.key)).toEqual(['actend', 'blog', 'pinterest']);
  });
});

describe('dates', () => {
  it('formats a month key in local time', () => {
    expect(monthKey(new Date(2026, 7, 27))).toBe('2026-08');
    expect(monthKey(new Date(2026, 0, 1))).toBe('2026-01');
  });

  it('does not drift across the UTC boundary', () => {
    // toISOString() would roll this back to the 26th in positive offsets.
    const lateNight = new Date(2026, 7, 27, 23, 30);
    expect(isoDate(lateNight)).toBe('2026-08-27');
    expect(monthKey(lateNight)).toBe('2026-08');
  });

  it('round-trips ISO dates', () => {
    const d = parseIsoDate('2026-08-27');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(27);
    expect(isoDate(d)).toBe('2026-08-27');
  });

  it('renders human labels', () => {
    expect(monthLabel('2026-08')).toBe('August 2026');
    expect(formatDate('2026-08-27')).toBe('27 August 2026');
  });
});

describe('submissionDeadline', () => {
  it('is 5 working days before the last day of the month', () => {
    // August 2026 ends Monday 31st. Counting back 5 working days:
    // Fri 28, Thu 27, Wed 26, Tue 25, Mon 24.
    expect(isoDate(submissionDeadline('2026-08'))).toBe('2026-08-24');
  });

  it('skips weekends when the month ends mid-week', () => {
    // September 2026 ends Wednesday 30th: 29, 28, then back over the weekend
    // to Fri 25, Thu 24, Wed 23.
    expect(isoDate(submissionDeadline('2026-09'))).toBe('2026-09-23');
  });

  it('handles a month ending on a Sunday', () => {
    // January 2027 ends Sunday 31st: Fri 29, Thu 28, Wed 27, Tue 26, Mon 25.
    expect(isoDate(submissionDeadline('2027-01'))).toBe('2027-01-25');
  });

  it('handles February in a leap year', () => {
    // February 2028 ends Tuesday 29th: Mon 28, Fri 25, Thu 24, Wed 23, Tue 22.
    expect(isoDate(submissionDeadline('2028-02'))).toBe('2028-02-22');
  });

  it('always lands on a weekday', () => {
    for (let month = 1; month <= 12; month += 1) {
      const key = `2026-${String(month).padStart(2, '0')}`;
      const day = submissionDeadline(key).getDay();
      expect(day).toBeGreaterThan(0);
      expect(day).toBeLessThan(6);
    }
  });
});

describe('deadlineStatus', () => {
  it('is ok well ahead of the deadline', () => {
    const status = deadlineStatus('2026-08', new Date(2026, 7, 10));
    expect(status.status).toBe('ok');
    expect(status.daysRemaining).toBe(14);
  });

  it('warns within three days', () => {
    expect(deadlineStatus('2026-08', new Date(2026, 7, 22)).status).toBe('due-soon');
    expect(deadlineStatus('2026-08', new Date(2026, 7, 24)).status).toBe('due-soon');
  });

  it('is late the day after the deadline', () => {
    const status = deadlineStatus('2026-08', new Date(2026, 7, 25));
    expect(status.status).toBe('late');
    expect(status.daysRemaining).toBe(-1);
  });

  it('is not thrown off by the time of day', () => {
    const lateOnDeadlineDay = deadlineStatus('2026-08', new Date(2026, 7, 24, 23, 59));
    expect(lateOnDeadlineDay.status).toBe('due-soon');
    expect(lateOnDeadlineDay.daysRemaining).toBe(0);
  });
});

describe('invoiceFileBase', () => {
  const invoice = (over: Partial<Invoice['profile']>): Invoice =>
    ({
      periodMonth: '2026-08',
      profile: { fullName: 'Md Ajmal Hossain', businessName: 'Ajju Iglesias', ...over },
    }) as Invoice;

  it('matches the company naming convention', () => {
    expect(invoiceFileBase(invoice({}))).toBe('Invoice August 2026 Ajju');
  });

  it('falls back to the full name when there is no business name', () => {
    expect(invoiceFileBase(invoice({ businessName: '' }))).toBe('Invoice August 2026 Md');
  });

  it('falls back again when neither is set', () => {
    expect(invoiceFileBase(invoice({ businessName: '', fullName: '' }))).toBe(
      'Invoice August 2026 Freelancer',
    );
  });

  it('strips characters that are illegal in filenames', () => {
    const name = invoiceFileBase(invoice({ businessName: 'A/B:C*D?E"F<G>H|I' }));
    expect(name).not.toMatch(/[\\/:*?"<>|]/);
  });
});
