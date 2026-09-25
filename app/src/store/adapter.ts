import type { RateItem } from '../domain/rate-card';
import type { InvoiceStatus, Role } from '../domain/status';
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

// ---------------------------------------------------------------------------
// Team mode
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  fullName: string;
  businessName: string;
  email: string;
  role: Role;
  active: boolean;
}

export interface UserInvite {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
  acceptedAt?: string;
}

export interface AccessAuditEntry {
  id: number;
  actorId: string;
  targetEmail: string;
  action: string;
  oldRole?: Role;
  newRole?: Role;
  createdAt: string;
}

export interface RateCardSummary {
  id: string;
  version: string;
  publishedAt: string;
  itemCount: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  profile: FreelancerProfile;
}

/**
 * The extra capabilities that only exist with a backend: who you are, the
 * approval queue, people, and the shared rate card.
 *
 * Deliberately separate from StorageAdapter. Running without a backend is not
 * a degraded team mode — it is a different, complete product, and pretending
 * otherwise would mean stubbing approval flows that mean nothing on one
 * machine.
 */
export interface TeamAdapter {
  currentUser(): Promise<CurrentUser | null>;
  signInWithPassword?(email: string, password: string): Promise<void>;
  signUpWithPassword?(email: string, password: string): Promise<void>;
  updatePassword?(password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Fires whenever the session changes. Returns an unsubscribe function. */
  onAuthChange(listener: () => void): () => void;

  /** Invoices awaiting this person's attention, by role. */
  listForReview(): Promise<Invoice[]>;
  setStatus(invoiceId: string, to: InvoiceStatus, note?: string): Promise<void>;

  listMembers(): Promise<TeamMember[]>;
  setRole(memberId: string, role: Role, confirmAdmin?: boolean): Promise<void>;
  setActive(memberId: string, active: boolean): Promise<void>;
  listInvites(): Promise<UserInvite[]>;
  inviteUser(email: string, role: Role, confirmAdmin?: boolean): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
  listAccessAudit(): Promise<AccessAuditEntry[]>;

  /** The published rate card, or null if none has been published yet. */
  loadPublishedRateCard(): Promise<{ version: string; items: RateItem[] } | null>;
  listRateCards(): Promise<RateCardSummary[]>;
  publishRateCard(version: string, items: RateItem[]): Promise<void>;
  deleteRateCard(id: string): Promise<void>;
}
