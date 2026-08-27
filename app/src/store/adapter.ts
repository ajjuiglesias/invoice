import type { FreelancerProfile, Invoice, InvoiceLine } from '../domain/types';

/** A part-built invoice, kept so a refresh does not lose work. */
export interface Draft {
  invoiceNumber: number;
  issueDate: string;
  periodMonth: string;
  lines: InvoiceLine[];
}

/**
 * Everything the app needs to persist.
 *
 * Phase A is backed by localStorage. Phase B swaps in a Supabase-backed
 * implementation with team logins and shared history — the UI does not change,
 * because it only ever talks to this interface.
 */
export interface StorageAdapter {
  loadProfile(): Promise<FreelancerProfile | null>;
  saveProfile(profile: FreelancerProfile): Promise<void>;

  loadDraft(): Promise<Draft | null>;
  saveDraft(draft: Draft | null): Promise<void>;

  listInvoices(): Promise<Invoice[]>;
  saveInvoice(invoice: Invoice): Promise<void>;
  deleteInvoice(id: string): Promise<void>;

  /** One past the highest invoice number recorded, or 1 if there are none. */
  nextInvoiceNumber(): Promise<number>;
}
