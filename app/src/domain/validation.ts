import { COMPANY } from './company';
import { rateItem } from './rate-card';
import type { FreelancerProfile, Invoice, InvoiceLine } from './types';

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  message: string;
  /** Line key this issue belongs to, when it is line-specific. */
  lineKey?: string;
  field?: string;
}

const ASANA_HOST = /(^|\.)asana\.com$/i;
const JCEM_HOST = /juliacharleseventmanagement\.co\.uk$/i;

function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname;
  } catch {
    return null;
  }
}

export function isAsanaLink(url: string): boolean {
  const h = hostOf(url);
  return !!h && ASANA_HOST.test(h);
}

export function isJcemLink(url: string): boolean {
  const h = hostOf(url);
  return !!h && JCEM_HOST.test(h);
}

/** Links that are clearly not a published page yet. */
function looksUnpublished(url: string): boolean {
  return /[?&]preview=true\b/i.test(url) || /[?&]p=\d+/i.test(url);
}

export function validateProfile(profile: FreelancerProfile): Issue[] {
  const issues: Issue[] = [];
  const req = (value: string, field: string, label: string) => {
    if (!value.trim()) {
      issues.push({ severity: 'error', field, message: `${label} is required.` });
    }
  };

  req(profile.fullName, 'fullName', 'Full name');
  req(profile.email, 'email', 'Email address');
  req(profile.postalAddress, 'postalAddress', 'Postal address');
  req(profile.country, 'country', 'Country');
  req(profile.bank.accountName, 'bank.accountName', 'Account name');
  req(profile.bank.bankName, 'bank.bankName', 'Bank name');

  if (profile.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email.trim())) {
    issues.push({ severity: 'error', field: 'email', message: 'Email address is not valid.' });
  }

  const hasUkDetails = !!profile.bank.sortCode.trim() && !!profile.bank.accountNumber.trim();
  const hasOverseasDetails = !!profile.bank.iban.trim() || !!profile.bank.bicSwift.trim();

  if (!hasUkDetails && !hasOverseasDetails) {
    issues.push({
      severity: 'error',
      field: 'bank.sortCode',
      message:
        'Give either a UK sort code and account number, or the overseas IBAN / BIC-SWIFT details.',
    });
  }

  if (profile.bank.sortCode.trim() && !/^\d{2}-?\d{2}-?\d{2}$/.test(profile.bank.sortCode.trim())) {
    issues.push({
      severity: 'warning',
      field: 'bank.sortCode',
      message: 'Sort code usually looks like 12-34-56.',
    });
  }

  const country = profile.country.trim().toLowerCase();
  const isUk = ['uk', 'united kingdom', 'england', 'scotland', 'wales', 'northern ireland', 'gb'].includes(
    country,
  );
  if (country && !isUk && !hasOverseasDetails) {
    issues.push({
      severity: 'warning',
      field: 'bank.iban',
      message:
        'You are invoicing from outside the UK — accounts usually need an IBAN and BIC/SWIFT to pay you.',
    });
  }

  return issues;
}

export function validateLine(line: InvoiceLine): Issue[] {
  const issues: Issue[] = [];
  const item = rateItem(line.rateItemId);
  const name = item?.short ?? 'Line';
  const add = (severity: Severity, message: string, field?: string) =>
    issues.push({ severity, message: `${name}: ${message}`, lineKey: line.key, field });

  if (!item) {
    add('error', 'this task type no longer exists in the rate card.');
    return issues;
  }

  if (!Number.isFinite(line.qty) || line.qty <= 0) {
    add('error', 'quantity must be at least 1.', 'qty');
  }
  if (!Number.isInteger(line.qty)) {
    add('error', 'quantity must be a whole number.', 'qty');
  }

  if (!Number.isFinite(line.unitPrice) || line.unitPrice <= 0) {
    add('error', 'unit price must be more than £0.', 'unitPrice');
  }
  if (!item.customPrice && line.unitPrice !== item.price) {
    add(
      'warning',
      `unit price has been changed from the rate card (£${item.price}). Only Adhoc lines should differ.`,
      'unitPrice',
    );
  }

  const asana = line.asanaLinks.filter((l) => l.trim());
  const pages = line.pageLinks.filter((l) => l.trim());

  if (asana.length === 0) {
    add('error', 'add at least one Asana task link.', 'asanaLinks');
  }
  if (pages.length === 0) {
    add('error', 'add at least one published page link.', 'pageLinks');
  }

  asana.forEach((url) => {
    if (!isAsanaLink(url)) add('error', `"${truncate(url)}" is not an Asana link.`, 'asanaLinks');
  });

  pages.forEach((url) => {
    if (!hostOf(url)) {
      add('error', `"${truncate(url)}" is not a valid URL.`, 'pageLinks');
      return;
    }
    if (!isJcemLink(url)) {
      add(
        'warning',
        `"${truncate(url)}" is not on ${COMPANY.website} — check it is the live page.`,
        'pageLinks',
      );
    }
    if (looksUnpublished(url)) {
      add(
        'warning',
        `"${truncate(url)}" looks like a preview or draft URL. You can only invoice for published pages.`,
        'pageLinks',
      );
    }
  });

  if (asana.length && pages.length && asana.length !== pages.length) {
    add(
      'warning',
      `${asana.length} Asana link(s) but ${pages.length} page link(s) — the company expects one of each per piece of work.`,
    );
  }

  if (line.qty > Math.max(asana.length, pages.length)) {
    add(
      'warning',
      `quantity is ${line.qty} but only ${Math.max(asana.length, pages.length)} link(s) supplied. Add a link for each piece of work.`,
    );
  }

  return issues;
}

export function validateInvoice(invoice: Invoice): Issue[] {
  const issues: Issue[] = [...validateProfile(invoice.profile)];

  if (!Number.isFinite(invoice.invoiceNumber) || invoice.invoiceNumber <= 0) {
    issues.push({ severity: 'error', field: 'invoiceNumber', message: 'Invoice number is required.' });
  }

  if (invoice.lines.length === 0) {
    issues.push({ severity: 'error', message: 'Add at least one line to the invoice.' });
  }

  invoice.lines.forEach((line) => issues.push(...validateLine(line)));

  // Duplicate Asana links across the whole invoice — the usual double-billing slip.
  const seen = new Map<string, string>();
  invoice.lines.forEach((line) => {
    line.asanaLinks
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((url) => {
        const normalised = url.split('?')[0].replace(/\/$/, '');
        const firstSeenOn = seen.get(normalised);
        if (firstSeenOn && firstSeenOn !== line.key) {
          issues.push({
            severity: 'error',
            lineKey: line.key,
            message: `The same Asana task is invoiced twice: ${truncate(url)}`,
          });
        } else {
          seen.set(normalised, line.key);
        }
      });
  });

  return issues;
}

export function errorsOnly(issues: Issue[]): Issue[] {
  return issues.filter((i) => i.severity === 'error');
}

function truncate(s: string, max = 60): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
