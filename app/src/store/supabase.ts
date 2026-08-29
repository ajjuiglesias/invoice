import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { subtotal } from '../domain/invoice';
import { rateItem, type Group, type Indent, type RateItem } from '../domain/rate-card';
import type { InvoiceStatus, Role } from '../domain/status';
import { EMPTY_BANK, type BankDetails, type FreelancerProfile, type Invoice, type InvoiceLine } from '../domain/types';
import type { CurrentUser, Draft, StorageAdapter, TeamAdapter, TeamMember } from './adapter';
import { requireSupabase } from './supabase-client';

/**
 * Team-mode storage.
 *
 * Bank details are the deliberate exception: they are never sent to the
 * server. They stay in this browser and are read back here so the rest of the
 * app cannot tell the difference. See §1 of PLAN-PHASE-B.md.
 */
const BANK_KEY = 'jcem.bank.v1';

function loadLocalBank(): BankDetails {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    return raw ? { ...EMPTY_BANK, ...(JSON.parse(raw) as BankDetails) } : EMPTY_BANK;
  } catch {
    return EMPTY_BANK;
  }
}

function saveLocalBank(bank: BankDetails): void {
  try {
    localStorage.setItem(BANK_KEY, JSON.stringify(bank));
  } catch {
    /* storage blocked — the invoice still generates, details just aren't kept */
  }
}

function fail(context: string, error: PostgrestError | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

interface ProfileRow {
  id: string;
  full_name: string;
  business_name: string;
  email: string;
  postal_address: string;
  country: string;
  role: Role;
  active: boolean;
}

interface InvoiceRow {
  id: string;
  freelancer_id: string;
  number: number;
  period_month: string;
  issue_date: string;
  status: InvoiceStatus;
  subtotal: string | number;
  decision_note: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
  invoice_lines?: LineRow[];
  profiles?: ProfileRow | null;
}

interface LineRow {
  id: string;
  item_key: string;
  template_row: number;
  qty: number;
  unit_price: string | number;
  asana_links: string[];
  page_links: string[];
}

const INVOICE_SELECT =
  '*, invoice_lines(*), profiles!invoices_freelancer_id_fkey(id, full_name, business_name, email, postal_address, country, role, active)';

function toProfile(row: ProfileRow | null | undefined, bank: BankDetails): FreelancerProfile {
  return {
    fullName: row?.full_name ?? '',
    businessName: row?.business_name ?? '',
    email: row?.email ?? '',
    postalAddress: row?.postal_address ?? '',
    country: row?.country ?? '',
    bank,
  };
}

function toInvoice(row: InvoiceRow, profile: FreelancerProfile, version: string): Invoice {
  const lines: InvoiceLine[] = (row.invoice_lines ?? [])
    .slice()
    .sort((a, b) => a.template_row - b.template_row)
    .map((l) => ({
      key: l.id,
      rateItemId: l.item_key,
      qty: l.qty,
      unitPrice: Number(l.unit_price),
      asanaLinks: l.asana_links.length ? l.asana_links : [''],
      pageLinks: l.page_links.length ? l.page_links : [''],
    }));

  return {
    id: row.id,
    invoiceNumber: row.number,
    issueDate: row.issue_date,
    periodMonth: row.period_month,
    profile,
    lines,
    rateCardVersion: version,
    createdAt: row.created_at,
    status: row.status,
    freelancerId: row.freelancer_id,
    decisionNote: row.decision_note ?? undefined,
    submittedAt: row.submitted_at ?? undefined,
    decidedAt: row.decided_at ?? undefined,
  };
}

export class SupabaseAdapter implements StorageAdapter, TeamAdapter {
  private readonly db: SupabaseClient;

  /** Cached so every row mapping does not re-read it. */
  private userId: string | null = null;

  constructor(private readonly rateCardVersion: string) {
    this.db = requireSupabase();
  }

  // ---- Identity -----------------------------------------------------------

  private async requireUserId(): Promise<string> {
    if (this.userId) return this.userId;
    const { data } = await this.db.auth.getUser();
    if (!data.user) throw new Error('You are signed out. Sign in again to continue.');
    this.userId = data.user.id;
    return this.userId;
  }

  async currentUser(): Promise<CurrentUser | null> {
    const { data } = await this.db.auth.getUser();
    if (!data.user) return null;
    this.userId = data.user.id;

    const { data: row, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle<ProfileRow>();
    fail('Could not load your profile', error);

    return {
      id: data.user.id,
      email: data.user.email ?? row?.email ?? '',
      role: row?.role ?? 'freelancer',
      profile: toProfile(row, loadLocalBank()),
    };
  }

  async signInWithEmail(email: string): Promise<void> {
    try {
      const { error } = await this.db.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new Error(error.message);
    } catch (error) {
      throw new Error(humanise(error));
    }
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
    this.userId = null;
  }

  onAuthChange(listener: () => void): () => void {
    const { data } = this.db.auth.onAuthStateChange(() => {
      this.userId = null; // force a re-read on the next call
      listener();
    });
    return () => data.subscription.unsubscribe();
  }

  // ---- Profile ------------------------------------------------------------

  async loadProfile(): Promise<FreelancerProfile | null> {
    const id = await this.requireUserId();
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .eq('id', id)
      .maybeSingle<ProfileRow>();
    fail('Could not load your profile', error);
    if (!data) return null;
    return toProfile(data, loadLocalBank());
  }

  async saveProfile(profile: FreelancerProfile): Promise<void> {
    const id = await this.requireUserId();

    // Bank details never leave this browser.
    saveLocalBank(profile.bank);

    const { error } = await this.db
      .from('profiles')
      .update({
        full_name: profile.fullName,
        business_name: profile.businessName,
        email: profile.email,
        postal_address: profile.postalAddress,
        country: profile.country,
      })
      .eq('id', id);
    fail('Could not save your details', error);
  }

  // ---- Draft --------------------------------------------------------------

  async loadDraft(): Promise<Draft | null> {
    const id = await this.requireUserId();
    const { data, error } = await this.db
      .from('drafts')
      .select('payload')
      .eq('freelancer_id', id)
      .maybeSingle<{ payload: Draft }>();
    fail('Could not load your draft', error);
    return data?.payload ?? null;
  }

  async saveDraft(draft: Draft | null): Promise<void> {
    const id = await this.requireUserId();
    if (draft === null) {
      const { error } = await this.db.from('drafts').delete().eq('freelancer_id', id);
      fail('Could not clear your draft', error);
      return;
    }
    const { error } = await this.db
      .from('drafts')
      .upsert({ freelancer_id: id, payload: draft, updated_at: new Date().toISOString() });
    fail('Could not save your draft', error);
  }

  // ---- Invoices -----------------------------------------------------------

  async listInvoices(): Promise<Invoice[]> {
    const id = await this.requireUserId();
    const { data, error } = await this.db
      .from('invoices')
      .select(INVOICE_SELECT)
      .eq('freelancer_id', id)
      .order('number', { ascending: false })
      .returns<InvoiceRow[]>();
    fail('Could not load your invoices', error);

    const bank = loadLocalBank();
    return (data ?? []).map((row) => toInvoice(row, toProfile(row.profiles, bank), this.rateCardVersion));
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    const id = await this.requireUserId();

    const { data: saved, error } = await this.db
      .from('invoices')
      .upsert({
        id: invoice.id,
        freelancer_id: id,
        number: invoice.invoiceNumber,
        period_month: invoice.periodMonth,
        issue_date: invoice.issueDate,
        subtotal: subtotal(invoice.lines),
      })
      .select('id')
      .single<{ id: string }>();
    fail('Could not save the invoice', error);
    if (!saved) throw new Error('Could not save the invoice.');

    // Replace the lines wholesale — simpler and safer than diffing, and the
    // row count is always small.
    const { error: clearError } = await this.db
      .from('invoice_lines')
      .delete()
      .eq('invoice_id', saved.id);
    fail('Could not update the invoice lines', clearError);

    const rows = invoice.lines
      .map((line) => {
        const item = rateItem(line.rateItemId);
        if (!item) return null;
        return {
          invoice_id: saved.id,
          item_key: line.rateItemId,
          template_row: item.row,
          qty: line.qty,
          unit_price: line.unitPrice,
          asana_links: line.asanaLinks.map((l) => l.trim()).filter(Boolean),
          page_links: line.pageLinks.map((l) => l.trim()).filter(Boolean),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      const { error: insertError } = await this.db.from('invoice_lines').insert(rows);
      fail('Could not save the invoice lines', insertError);
    }
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    const { error } = await this.db.from('invoices').delete().eq('id', invoiceId);
    fail('Could not remove the invoice', error);
  }

  async nextInvoiceNumber(): Promise<number> {
    const { data, error } = await this.db.rpc('next_invoice_number');
    if (error) throw new Error(`Could not allocate an invoice number: ${error.message}`);
    return typeof data === 'number' ? data : 1;
  }

  // ---- Review queue -------------------------------------------------------

  async listForReview(): Promise<Invoice[]> {
    // Row level security decides what comes back; the query asks for
    // everything the caller is allowed to see that is past draft.
    const { data, error } = await this.db
      .from('invoices')
      .select(INVOICE_SELECT)
      .neq('status', 'draft')
      .order('submitted_at', { ascending: true, nullsFirst: false })
      .returns<InvoiceRow[]>();
    fail('Could not load the review queue', error);

    return (data ?? []).map((row) =>
      // Someone else's bank details are not ours to show.
      toInvoice(row, toProfile(row.profiles, EMPTY_BANK), this.rateCardVersion),
    );
  }

  async setStatus(invoiceId: string, to: InvoiceStatus, note?: string): Promise<void> {
    const patch: Record<string, unknown> = { status: to };
    if (note !== undefined) patch.decision_note = note;

    const { error } = await this.db.from('invoices').update(patch).eq('id', invoiceId);
    fail('Could not update the invoice', error);
  }

  // ---- People -------------------------------------------------------------

  async listMembers(): Promise<TeamMember[]> {
    const { data, error } = await this.db
      .from('profiles')
      .select('*')
      .order('full_name')
      .returns<ProfileRow[]>();
    fail('Could not load the team', error);

    return (data ?? []).map((row) => ({
      id: row.id,
      fullName: row.full_name,
      businessName: row.business_name,
      email: row.email,
      role: row.role,
      active: row.active,
    }));
  }

  async setRole(memberId: string, role: Role): Promise<void> {
    const { error } = await this.db.from('profiles').update({ role }).eq('id', memberId);
    fail('Could not change that role', error);
  }

  // ---- Rate card ----------------------------------------------------------

  async loadPublishedRateCard(): Promise<{ version: string; items: RateItem[] } | null> {
    const { data, error } = await this.db
      .from('rate_cards')
      .select('version, rate_items(*)')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ version: string; rate_items: RateItemRow[] }>();
    fail('Could not load the rate card', error);
    if (!data || !data.rate_items?.length) return null;

    return {
      version: data.version,
      items: data.rate_items
        .slice()
        .sort((a, b) => a.template_row - b.template_row)
        .map(toRateItem),
    };
  }

  async publishRateCard(version: string, items: RateItem[]): Promise<void> {
    const id = await this.requireUserId();

    const { data: card, error } = await this.db
      .from('rate_cards')
      .insert({ version, published_at: new Date().toISOString(), published_by: id })
      .select('id')
      .single<{ id: string }>();
    fail('Could not create the rate card', error);
    if (!card) throw new Error('Could not create the rate card.');

    const { error: itemsError } = await this.db.from('rate_items').insert(
      items.map((item) => ({
        rate_card_id: card.id,
        item_key: item.id,
        template_row: item.row,
        label: item.label,
        short: item.short,
        indent: item.indent,
        price: item.price,
        custom_price: item.customPrice ?? false,
        group_name: item.group,
        hint: item.hint ?? null,
      })),
    );
    fail('Could not save the rate card items', itemsError);
  }
}

interface RateItemRow {
  item_key: string;
  template_row: number;
  label: string;
  short: string;
  indent: number;
  price: string | number;
  custom_price: boolean;
  group_name: string;
  hint: string | null;
}

function toRateItem(row: RateItemRow): RateItem {
  return {
    id: row.item_key,
    row: row.template_row,
    label: row.label,
    short: row.short,
    indent: row.indent as Indent,
    price: Number(row.price),
    customPrice: row.custom_price,
    group: row.group_name as Group,
    hint: row.hint ?? undefined,
  };
}

/**
 * Supabase surfaces a bare "Failed to fetch" when it cannot reach the project
 * at all — usually a wrong URL or no connection. That tells a freelancer
 * nothing, so say something they can act on.
 */
function humanise(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Could not reach the invoicing service. Check your connection and try again — if it keeps happening, tell whoever set this up.';
  }
  return message;
}
