import type { InvoiceStatus } from './status';

/** Core data shapes. Deliberately plain — these are persisted as JSON. */

/** Saved once per freelancer, reused on every invoice. */
export interface FreelancerProfile {
  fullName: string;
  businessName: string;
  email: string;
  postalAddress: string;
  country: string;
  bank: BankDetails;
}

export interface BankDetails {
  accountName: string;
  bankName: string;
  sortCode: string;
  accountNumber: string;
  /** Overseas only — left blank for UK-domiciled freelancers. */
  iban: string;
  bicSwift: string;
  currency: string;
}

/** One line on the invoice. Maps to exactly one template row. */
export interface InvoiceLine {
  /** Local id for React keys — not persisted meaningfully. */
  key: string;
  /** RateItem.id */
  rateItemId: string;
  qty: number;
  /** Overrides the rate card price. Only meaningful for adhoc lines. */
  unitPrice: number;
  /** One Asana task URL per piece of work. */
  asanaLinks: string[];
  /** One published page URL per piece of work. */
  pageLinks: string[];
}

export interface Invoice {
  /** Stable id for history. */
  id: string;
  invoiceNumber: number;
  /** ISO yyyy-mm-dd. */
  issueDate: string;
  /** The month being invoiced, as yyyy-mm. */
  periodMonth: string;
  profile: FreelancerProfile;
  lines: InvoiceLine[];
  /** Rate card version the prices came from. */
  rateCardVersion: string;
  /** ISO timestamp. */
  createdAt: string;

  // ---- Team mode only. Undefined when running without a backend. ----------

  /** Where the invoice sits in the approval flow. */
  status?: InvoiceStatus;
  /** Profile id of the freelancer who raised it. */
  freelancerId?: string;
  /** Note left by the manager when requesting changes. */
  decisionNote?: string;
  submittedAt?: string;
  decidedAt?: string;
}

export const EMPTY_BANK: BankDetails = {
  accountName: '',
  bankName: '',
  sortCode: '',
  accountNumber: '',
  iban: '',
  bicSwift: '',
  currency: '',
};

export const EMPTY_PROFILE: FreelancerProfile = {
  fullName: '',
  businessName: '',
  email: '',
  postalAddress: '',
  country: '',
  bank: EMPTY_BANK,
};
