/** Fixed company facts, taken from the template and the "How To" sheet. */

export const COMPANY = {
  name: 'Julia Charles Event Management',
  legalName: 'Julia Charles Event Management Ltd.',
  addressLines: [
    'First Floor Suite at 4 Canon Harnett Court',
    'Warren Park',
    'Stratford Road',
    'Wolverton Mill',
    'Milton Keynes',
    'MK12 5NW',
  ],
  website: 'juliacharleseventmanagement.co.uk',
} as const;

export const RECIPIENTS = {
  /** Accounts receive the invoice directly. */
  to: 'accounts@juliacharles.co.uk',
  /** Copied in for approval and visibility. */
  cc: 'stacy@juliacharles.co.uk',
  /** Opening line of the covering email. */
  greeting: 'Hi,',
} as const;

/** Brand palette, straight from the brand guidelines deck. */
export const BRAND = {
  teal: '#0FABAC',
  charcoal: '#35383F',
  charcoalAlt: '#3C4147',
  red: '#EF3340',
  white: '#FFFFFF',
} as const;

/** The invoicing rules from the template's "How To" sheet. */
export const INVOICING_RULES = [
  'Invoices must be sent on a monthly basis.',
  'Fees are payable on the basis of approved and published content only.',
  'Attach an Asana link and a webpage link to each page on the website you complete.',
  'You can only invoice for pages that have been signed off by your line manager and published.',
  'All elements of the process must be completed before invoicing.',
  'Send to your line manager at least 5 working days before the last day of the month.',
] as const;

/** Working days of notice required before the last day of the month. */
export const NOTICE_WORKING_DAYS = 5;
