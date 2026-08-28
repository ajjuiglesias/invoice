import { describe, expect, it } from 'vitest';
import { FIRST_ITEM_ROW, LAST_ITEM_ROW, RATE_CARD } from './rate-card';
import type { FreelancerProfile, Invoice, InvoiceLine } from './types';
import type { Issue } from './validation';
import { isAsanaLink, isJcemLink, validateInvoice, validateLine, validateProfile } from './validation';

const ASANA = 'https://app.asana.com/1/4/project/1/task/111';
const PAGE = 'https://www.juliacharleseventmanagement.co.uk/some-blog/';

const profile = (over: Partial<FreelancerProfile> = {}): FreelancerProfile => ({
  fullName: 'Md Ajmal Hossain',
  businessName: 'Ajju Iglesias',
  email: 'ajjuiglesias@gmail.com',
  postalAddress: 'Somewhere',
  country: 'United Kingdom',
  bank: {
    accountName: 'Md Ajmal Hossain',
    bankName: 'Barclays',
    sortCode: '23-14-86',
    accountNumber: '15889046',
    iban: '',
    bicSwift: '',
    currency: '',
    ...over.bank,
  },
  ...over,
});

const line = (over: Partial<InvoiceLine> = {}): InvoiceLine => ({
  key: 'k',
  rateItemId: 'blog-new',
  qty: 1,
  unitPrice: 80,
  asanaLinks: [ASANA],
  pageLinks: [PAGE],
  ...over,
});

const errorsOf = (issues: Issue[]) => issues.filter((i) => i.severity === 'error');
const warningsOf = (issues: Issue[]) => issues.filter((i) => i.severity === 'warning');

describe('link recognition', () => {
  it('accepts asana hosts', () => {
    expect(isAsanaLink(ASANA)).toBe(true);
    expect(isAsanaLink('https://asana.com/x')).toBe(true);
  });

  it('rejects lookalike hosts', () => {
    expect(isAsanaLink('https://notasana.com/x')).toBe(false);
    expect(isAsanaLink('https://asana.com.evil.io/x')).toBe(false);
    expect(isAsanaLink('not a url')).toBe(false);
  });

  it('recognises the company site', () => {
    expect(isJcemLink(PAGE)).toBe(true);
    expect(isJcemLink('https://example.com/')).toBe(false);
  });
});

describe('validateProfile', () => {
  it('passes a complete UK profile', () => {
    expect(errorsOf(validateProfile(profile()))).toHaveLength(0);
  });

  it('requires the core fields', () => {
    const issues = validateProfile(
      profile({ fullName: '', email: '', postalAddress: '', country: '' }),
    );
    const fields = errorsOf(issues).map((i) => i.field);
    expect(fields).toContain('fullName');
    expect(fields).toContain('email');
    expect(fields).toContain('postalAddress');
    expect(fields).toContain('country');
  });

  it('rejects a malformed email', () => {
    const issues = validateProfile(profile({ email: 'not-an-email' }));
    expect(errorsOf(issues).some((i) => i.field === 'email')).toBe(true);
  });

  it('accepts overseas details instead of a sort code', () => {
    const overseas = profile({
      country: 'India',
      bank: {
        accountName: 'A',
        bankName: 'B',
        sortCode: '',
        accountNumber: '',
        iban: 'GB33BUKB20201555555555',
        bicSwift: 'BUKBGB22',
        currency: 'GBP',
      },
    });
    expect(errorsOf(validateProfile(overseas))).toHaveLength(0);
  });

  it('errors when neither UK nor overseas details are given', () => {
    const none = profile({
      bank: {
        accountName: 'A',
        bankName: 'B',
        sortCode: '',
        accountNumber: '',
        iban: '',
        bicSwift: '',
        currency: '',
      },
    });
    expect(errorsOf(validateProfile(none)).length).toBeGreaterThan(0);
  });

  it('warns a non-UK freelancer with no IBAN', () => {
    const issues = validateProfile(profile({ country: 'India' }));
    expect(warningsOf(issues).some((i) => i.message.includes('IBAN'))).toBe(true);
  });

  it('warns about an odd sort code but does not block', () => {
    const issues = validateProfile(profile({ bank: { ...profile().bank, sortCode: 'abc' } }));
    expect(errorsOf(issues)).toHaveLength(0);
    expect(warningsOf(issues).some((i) => i.message.includes('12-34-56'))).toBe(true);
  });
});

describe('validateLine', () => {
  it('passes a well-formed line', () => {
    expect(errorsOf(validateLine(line()))).toHaveLength(0);
  });

  it('requires both kinds of link', () => {
    expect(errorsOf(validateLine(line({ asanaLinks: [] }))).length).toBeGreaterThan(0);
    expect(errorsOf(validateLine(line({ pageLinks: [] }))).length).toBeGreaterThan(0);
  });

  it('rejects a non-asana task link', () => {
    const issues = validateLine(line({ asanaLinks: ['https://trello.com/c/abc'] }));
    expect(errorsOf(issues).some((i) => i.message.includes('not an Asana link'))).toBe(true);
  });

  it('rejects a quantity below one and non-integers', () => {
    expect(errorsOf(validateLine(line({ qty: 0 }))).length).toBeGreaterThan(0);
    expect(errorsOf(validateLine(line({ qty: 1.5 }))).length).toBeGreaterThan(0);
  });

  it('warns when the price is off the rate card', () => {
    const issues = validateLine(line({ unitPrice: 95 }));
    expect(warningsOf(issues).some((i) => i.message.includes('rate card'))).toBe(true);
  });

  it('lets adhoc lines set their own price without complaint', () => {
    const issues = validateLine(line({ rateItemId: 'adhoc', unitPrice: 123 }));
    expect(warningsOf(issues).some((i) => i.message.includes('rate card'))).toBe(false);
  });

  it('flags a preview URL as probably unpublished', () => {
    const preview =
      'https://www.juliacharleseventmanagement.co.uk/?post_type=entertainment&p=94747&preview=true';
    const issues = validateLine(line({ pageLinks: [preview] }));
    expect(warningsOf(issues).some((i) => i.message.includes('preview or draft'))).toBe(true);
  });

  it('warns when a page is not on the company site', () => {
    const issues = validateLine(line({ pageLinks: ['https://example.com/page'] }));
    expect(warningsOf(issues).some((i) => i.message.includes('live page'))).toBe(true);
  });

  it('warns when the quantity outruns the number of links', () => {
    const issues = validateLine(line({ qty: 3 }));
    expect(warningsOf(issues).some((i) => i.message.includes('only 1 link'))).toBe(true);
  });

  it('warns when the two link counts disagree', () => {
    const issues = validateLine(line({ qty: 2, asanaLinks: [ASANA, `${ASANA}2`], pageLinks: [PAGE] }));
    expect(warningsOf(issues).some((i) => i.message.includes('one of each'))).toBe(true);
  });

  it('reports an unknown task type', () => {
    const issues = validateLine(line({ rateItemId: 'no-such-item' }));
    expect(errorsOf(issues).some((i) => i.message.includes('no longer exists'))).toBe(true);
  });
});

describe('validateInvoice', () => {
  const invoice = (lines: InvoiceLine[]): Invoice =>
    ({
      id: 'i',
      invoiceNumber: 4,
      issueDate: '2026-08-27',
      periodMonth: '2026-08',
      profile: profile(),
      lines,
      rateCardVersion: 'test',
      createdAt: '2026-08-27T00:00:00.000Z',
    }) as Invoice;

  it('requires at least one line', () => {
    expect(errorsOf(validateInvoice(invoice([]))).length).toBeGreaterThan(0);
  });

  it('catches the same Asana task invoiced on two lines', () => {
    const issues = validateInvoice(
      invoice([
        line({ key: 'a', rateItemId: 'blog-new' }),
        line({ key: 'b', rateItemId: 'blog-edit', unitPrice: 25 }),
      ]),
    );
    expect(errorsOf(issues).some((i) => i.message.includes('invoiced twice'))).toBe(true);
  });

  it('ignores query-string differences when spotting duplicates', () => {
    const issues = validateInvoice(
      invoice([
        line({ key: 'a', rateItemId: 'blog-new', asanaLinks: [`${ASANA}?focus=true`] }),
        line({ key: 'b', rateItemId: 'blog-edit', unitPrice: 25, asanaLinks: [ASANA] }),
      ]),
    );
    expect(errorsOf(issues).some((i) => i.message.includes('invoiced twice'))).toBe(true);
  });

  it('does not flag distinct tasks', () => {
    const issues = validateInvoice(
      invoice([
        line({ key: 'a', rateItemId: 'blog-new', asanaLinks: [`${ASANA}1`] }),
        line({ key: 'b', rateItemId: 'blog-edit', unitPrice: 25, asanaLinks: [`${ASANA}2`] }),
      ]),
    );
    expect(errorsOf(issues).some((i) => i.message.includes('invoiced twice'))).toBe(false);
  });

  it('rejects a missing invoice number', () => {
    const bad = { ...invoice([line()]), invoiceNumber: 0 };
    expect(errorsOf(validateInvoice(bad)).some((i) => i.message.includes('Invoice number'))).toBe(
      true,
    );
  });
});

describe('rate card invariants', () => {
  it('keeps every row inside the template range', () => {
    for (const item of RATE_CARD) {
      expect(item.row).toBeGreaterThanOrEqual(FIRST_ITEM_ROW);
      expect(item.row).toBeLessThanOrEqual(LAST_ITEM_ROW);
    }
  });

  it('never puts two task types on the same row', () => {
    const rows = RATE_CARD.map((i) => i.row);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('keeps ids unique', () => {
    const ids = RATE_CARD.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('prices every task type above zero', () => {
    for (const item of RATE_CARD) expect(item.price).toBeGreaterThan(0);
  });

  it('fills every row the template provides', () => {
    expect(RATE_CARD).toHaveLength(LAST_ITEM_ROW - FIRST_ITEM_ROW + 1);
  });
});
