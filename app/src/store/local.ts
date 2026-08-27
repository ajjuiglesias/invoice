import type { FreelancerProfile, Invoice } from '../domain/types';
import type { Draft, StorageAdapter } from './adapter';

const KEYS = {
  profile: 'jcem.profile.v1',
  draft: 'jcem.draft.v1',
  invoices: 'jcem.invoices.v1',
} as const;

/**
 * Phase A storage: everything lives in this browser, on this machine.
 *
 * Nothing is sent anywhere. That is the whole point of the no-backend build —
 * bank details never leave the freelancer's own computer.
 */
export class LocalStorageAdapter implements StorageAdapter {
  async loadProfile(): Promise<FreelancerProfile | null> {
    return read<FreelancerProfile>(KEYS.profile);
  }

  async saveProfile(profile: FreelancerProfile): Promise<void> {
    write(KEYS.profile, profile);
  }

  async loadDraft(): Promise<Draft | null> {
    return read<Draft>(KEYS.draft);
  }

  async saveDraft(draft: Draft | null): Promise<void> {
    if (draft === null) remove(KEYS.draft);
    else write(KEYS.draft, draft);
  }

  async listInvoices(): Promise<Invoice[]> {
    const all = read<Invoice[]>(KEYS.invoices) ?? [];
    return all.sort((a, b) => b.invoiceNumber - a.invoiceNumber);
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    const all = read<Invoice[]>(KEYS.invoices) ?? [];
    const next = all.filter((i) => i.id !== invoice.id);
    next.push(invoice);
    write(KEYS.invoices, next);
  }

  async deleteInvoice(id: string): Promise<void> {
    const all = read<Invoice[]>(KEYS.invoices) ?? [];
    write(
      KEYS.invoices,
      all.filter((i) => i.id !== id),
    );
  }

  async nextInvoiceNumber(): Promise<number> {
    const all = await this.listInvoices();
    if (all.length === 0) return 1;
    return Math.max(...all.map((i) => i.invoiceNumber)) + 1;
  }
}

// ---------------------------------------------------------------------------

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // Corrupt entry, or storage blocked entirely (private mode, strict
    // cookie settings). Behave as though nothing was saved.
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage unavailable — the invoice can still be built
    // and downloaded, it just will not be remembered.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** True when the browser will actually keep what we write. */
export function storageAvailable(): boolean {
  try {
    const probe = '__jcem_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
