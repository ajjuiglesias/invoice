import { lineAmount, monthLabel, round2, subtotal } from './invoice';
import { rateItem } from './rate-card';
import type { InvoiceStatus } from './status';
import type { Invoice } from './types';

/**
 * Aggregation for the accounts view. All pure — hand it invoices, get numbers.
 */

export interface Tally {
  count: number;
  total: number;
}

export interface MonthSummary {
  periodMonth: string;
  label: string;
  count: number;
  total: number;
  byStatus: Partial<Record<InvoiceStatus, Tally>>;
}

export interface FreelancerSummary {
  freelancerId: string;
  name: string;
  count: number;
  total: number;
  /** Statuses present, so accounts can see what is still in flight. */
  statuses: InvoiceStatus[];
}

function add(tally: Tally | undefined, amount: number): Tally {
  return { count: (tally?.count ?? 0) + 1, total: round2((tally?.total ?? 0) + amount) };
}

export function summariseByMonth(invoices: Invoice[]): MonthSummary[] {
  const months = new Map<string, MonthSummary>();

  for (const invoice of invoices) {
    const amount = subtotal(invoice.lines);
    const status = invoice.status ?? 'draft';

    const existing = months.get(invoice.periodMonth) ?? {
      periodMonth: invoice.periodMonth,
      label: monthLabel(invoice.periodMonth),
      count: 0,
      total: 0,
      byStatus: {},
    };

    existing.count += 1;
    existing.total = round2(existing.total + amount);
    existing.byStatus[status] = add(existing.byStatus[status], amount);

    months.set(invoice.periodMonth, existing);
  }

  // Most recent month first.
  return [...months.values()].sort((a, b) => b.periodMonth.localeCompare(a.periodMonth));
}

export function summariseByFreelancer(
  invoices: Invoice[],
  periodMonth?: string,
): FreelancerSummary[] {
  const scope = periodMonth ? invoices.filter((i) => i.periodMonth === periodMonth) : invoices;
  const people = new Map<string, FreelancerSummary>();

  for (const invoice of scope) {
    const id = invoice.freelancerId ?? invoice.profile.email ?? 'unknown';
    const name =
      invoice.profile.businessName.trim() || invoice.profile.fullName.trim() || 'Unknown';

    const existing = people.get(id) ?? {
      freelancerId: id,
      name,
      count: 0,
      total: 0,
      statuses: [],
    };

    existing.count += 1;
    existing.total = round2(existing.total + subtotal(invoice.lines));

    const status = invoice.status ?? 'draft';
    if (!existing.statuses.includes(status)) existing.statuses.push(status);

    people.set(id, existing);
  }

  return [...people.values()].sort((a, b) => b.total - a.total);
}

export interface Outstanding {
  awaitingApproval: Tally;
  approvedNotSent: Tally;
  sentNotPaid: Tally;
}

const EMPTY: Tally = { count: 0, total: 0 };

/** What is still in flight, and what it is worth. */
export function outstanding(invoices: Invoice[]): Outstanding {
  const result: Outstanding = {
    awaitingApproval: { ...EMPTY },
    approvedNotSent: { ...EMPTY },
    sentNotPaid: { ...EMPTY },
  };

  for (const invoice of invoices) {
    const amount = subtotal(invoice.lines);
    const bucket =
      invoice.status === 'submitted'
        ? 'awaitingApproval'
        : invoice.status === 'approved'
          ? 'approvedNotSent'
          : invoice.status === 'sent'
            ? 'sentNotPaid'
            : null;

    if (bucket) {
      result[bucket].count += 1;
      result[bucket].total = round2(result[bucket].total + amount);
    }
  }

  return result;
}

/**
 * Who has not submitted anything for a month yet — the list accounts would
 * otherwise build by hand at month end.
 */
export function notYetInvoiced(
  people: Array<{ id: string; name: string }>,
  invoices: Invoice[],
  periodMonth: string,
): Array<{ id: string; name: string }> {
  const submitted = new Set(
    invoices
      .filter((i) => i.periodMonth === periodMonth && (i.status ?? 'draft') !== 'draft')
      .map((i) => i.freelancerId)
      .filter(Boolean),
  );
  return people.filter((p) => !submitted.has(p.id));
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180 quoting: wrap when needed, and double any embedded quotes. */
export function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(',');
}

/**
 * One row per invoice line, which is what a finance system wants to import.
 * A leading BOM keeps Excel from mangling the pound sign.
 */
export function invoicesToCsv(invoices: Invoice[]): string {
  const header = [
    'Invoice number',
    'Period',
    'Issue date',
    'Status',
    'Freelancer',
    'Business name',
    'Email',
    'Task type',
    'Quantity',
    'Unit price',
    'Amount',
    'Asana links',
    'Page links',
  ];

  const rows = invoices.flatMap((invoice) =>
    invoice.lines.map((line) =>
      toCsvRow([
        invoice.invoiceNumber,
        invoice.periodMonth,
        invoice.issueDate,
        invoice.status ?? 'draft',
        invoice.profile.fullName,
        invoice.profile.businessName,
        invoice.profile.email,
        rateItem(line.rateItemId)?.short ?? line.rateItemId,
        line.qty,
        line.unitPrice.toFixed(2),
        lineAmount(line).toFixed(2),
        line.asanaLinks.filter(Boolean).join(' '),
        line.pageLinks.filter(Boolean).join(' '),
      ]),
    ),
  );

  return `﻿${[toCsvRow(header), ...rows].join('\r\n')}\r\n`;
}
