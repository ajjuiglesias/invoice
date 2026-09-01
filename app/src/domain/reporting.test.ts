import { describe, expect, it } from 'vitest';
import {
  csvCell,
  invoicesToCsv,
  notYetInvoiced,
  outstanding,
  summariseByFreelancer,
  summariseByMonth,
  toCsvRow,
} from './reporting';
import type { InvoiceStatus } from './status';
import type { Invoice, InvoiceLine } from './types';

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  key: 'k',
  rateItemId: 'blog-new',
  qty: 1,
  unitPrice: 80,
  asanaLinks: ['https://app.asana.com/1/4/project/1/task/111'],
  pageLinks: ['https://www.juliacharleseventmanagement.co.uk/a/'],
  ...over,
});

let counter = 0;

const invoice = (over: Partial<Invoice> = {}): Invoice =>
  ({
    id: `i${counter++}`,
    invoiceNumber: 1,
    issueDate: '2026-08-27',
    periodMonth: '2026-08',
    rateCardVersion: 'test',
    createdAt: '2026-08-27T00:00:00.000Z',
    status: 'submitted' as InvoiceStatus,
    freelancerId: 'u1',
    profile: {
      fullName: 'Md Ajmal Hossain',
      businessName: 'Ajju Iglesias',
      email: 'ajju@example.com',
      postalAddress: '',
      country: 'India',
      bank: {
        accountName: '',
        bankName: '',
        sortCode: '',
        accountNumber: '',
        iban: '',
        bicSwift: '',
        currency: '',
      },
    },
    lines: [line()],
    ...over,
  }) as Invoice;

describe('summariseByMonth', () => {
  it('groups and totals by period', () => {
    const summary = summariseByMonth([
      invoice({ periodMonth: '2026-08', lines: [line({ qty: 1, unitPrice: 80 })] }),
      invoice({ periodMonth: '2026-08', lines: [line({ qty: 2, unitPrice: 35 })] }),
      invoice({ periodMonth: '2026-09', lines: [line({ qty: 1, unitPrice: 40 })] }),
    ]);

    expect(summary).toHaveLength(2);
    expect(summary[0].periodMonth).toBe('2026-09'); // newest first
    expect(summary[0].total).toBe(40);
    expect(summary[1].periodMonth).toBe('2026-08');
    expect(summary[1].count).toBe(2);
    expect(summary[1].total).toBe(150);
    expect(summary[1].label).toBe('August 2026');
  });

  it('splits each month by status', () => {
    const [august] = summariseByMonth([
      invoice({ status: 'approved', lines: [line({ unitPrice: 80 })] }),
      invoice({ status: 'approved', lines: [line({ unitPrice: 20 })] }),
      invoice({ status: 'submitted', lines: [line({ unitPrice: 35 })] }),
    ]);

    expect(august.byStatus.approved).toEqual({ count: 2, total: 100 });
    expect(august.byStatus.submitted).toEqual({ count: 1, total: 35 });
    expect(august.byStatus.paid).toBeUndefined();
  });

  it('handles no invoices', () => {
    expect(summariseByMonth([])).toEqual([]);
  });
});

describe('summariseByFreelancer', () => {
  it('groups by person, biggest first', () => {
    const summary = summariseByFreelancer([
      invoice({ freelancerId: 'u1', lines: [line({ unitPrice: 80 })] }),
      invoice({ freelancerId: 'u2', lines: [line({ unitPrice: 200 })] }),
      invoice({ freelancerId: 'u1', lines: [line({ unitPrice: 20 })] }),
    ]);

    expect(summary.map((s) => s.freelancerId)).toEqual(['u2', 'u1']);
    expect(summary[0].total).toBe(200);
    expect(summary[1].total).toBe(100);
    expect(summary[1].count).toBe(2);
  });

  it('can be scoped to one month', () => {
    const summary = summariseByFreelancer(
      [
        invoice({ freelancerId: 'u1', periodMonth: '2026-08', lines: [line({ unitPrice: 80 })] }),
        invoice({ freelancerId: 'u1', periodMonth: '2026-09', lines: [line({ unitPrice: 500 })] }),
      ],
      '2026-08',
    );

    expect(summary).toHaveLength(1);
    expect(summary[0].total).toBe(80);
  });

  it('collects the distinct statuses in play', () => {
    const summary = summariseByFreelancer([
      invoice({ freelancerId: 'u1', status: 'approved' }),
      invoice({ freelancerId: 'u1', status: 'approved' }),
      invoice({ freelancerId: 'u1', status: 'paid' }),
    ]);
    expect(summary[0].statuses.sort()).toEqual(['approved', 'paid']);
  });
});

describe('outstanding', () => {
  it('buckets what is still in flight', () => {
    const result = outstanding([
      invoice({ status: 'submitted', lines: [line({ unitPrice: 80 })] }),
      invoice({ status: 'submitted', lines: [line({ unitPrice: 20 })] }),
      invoice({ status: 'approved', lines: [line({ unitPrice: 35 })] }),
      invoice({ status: 'sent', lines: [line({ unitPrice: 10 })] }),
      invoice({ status: 'paid', lines: [line({ unitPrice: 999 })] }),
      invoice({ status: 'draft', lines: [line({ unitPrice: 999 })] }),
    ]);

    expect(result.awaitingApproval).toEqual({ count: 2, total: 100 });
    expect(result.approvedNotSent).toEqual({ count: 1, total: 35 });
    expect(result.sentNotPaid).toEqual({ count: 1, total: 10 });
  });

  it('ignores drafts and paid invoices', () => {
    const result = outstanding([invoice({ status: 'draft' }), invoice({ status: 'paid' })]);
    expect(result.awaitingApproval.count).toBe(0);
    expect(result.approvedNotSent.count).toBe(0);
    expect(result.sentNotPaid.count).toBe(0);
  });
});

describe('notYetInvoiced', () => {
  const people = [
    { id: 'u1', name: 'Ajju' },
    { id: 'u2', name: 'Sam' },
    { id: 'u3', name: 'Alex' },
  ];

  it('lists people with nothing submitted for the month', () => {
    const missing = notYetInvoiced(
      people,
      [invoice({ freelancerId: 'u1', periodMonth: '2026-08', status: 'submitted' })],
      '2026-08',
    );
    expect(missing.map((p) => p.id)).toEqual(['u2', 'u3']);
  });

  it('does not count a draft as submitted', () => {
    const missing = notYetInvoiced(
      people,
      [invoice({ freelancerId: 'u1', periodMonth: '2026-08', status: 'draft' })],
      '2026-08',
    );
    expect(missing.map((p) => p.id)).toContain('u1');
  });

  it('only looks at the month asked for', () => {
    const missing = notYetInvoiced(
      people,
      [invoice({ freelancerId: 'u1', periodMonth: '2026-07', status: 'approved' })],
      '2026-08',
    );
    expect(missing).toHaveLength(3);
  });
});

describe('csv', () => {
  it('leaves plain values alone', () => {
    expect(csvCell('hello')).toBe('hello');
    expect(csvCell(42)).toBe('42');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('builds a row', () => {
    expect(toCsvRow(['a', 'b,c', 1])).toBe('a,"b,c",1');
  });

  it('writes one row per line with a header', () => {
    const csv = invoicesToCsv([
      invoice({
        invoiceNumber: 4,
        lines: [
          line({ key: 'a', rateItemId: 'blog-new', qty: 2, unitPrice: 80 }),
          line({ key: 'b', rateItemId: 'act-end-new', qty: 1, unitPrice: 35 }),
        ],
      }),
    ]);

    const rows = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(rows).toHaveLength(3); // header + two lines
    expect(rows[0]).toContain('Invoice number');
    expect(rows[1]).toContain('New Blog');
    expect(rows[1]).toContain('160.00');
    expect(rows[2]).toContain('New Act End Page');
    expect(rows[2]).toContain('35.00');
  });

  it('starts with a BOM so Excel reads the pound sign correctly', () => {
    expect(invoicesToCsv([invoice()]).startsWith('﻿')).toBe(true);
  });

  it('survives a business name containing a comma', () => {
    const csv = invoicesToCsv([
      invoice({
        profile: { ...invoice().profile, businessName: 'Iglesias, Ajju & Co' },
      }),
    ]);
    expect(csv).toContain('"Iglesias, Ajju & Co"');
  });
});
