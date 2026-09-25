import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { rateItem, type Group, type Indent, type RateItem } from '../domain/rate-card';
import type { InvoiceStatus, Role } from '../domain/status';
import { EMPTY_BANK, type BankDetails, type FreelancerProfile, type Invoice, type InvoiceLine } from '../domain/types';
import type { AccessAuditEntry, CurrentUser, Draft, RateCardSummary, StorageAdapter, TeamAdapter, TeamMember, UserInvite } from './adapter';
import { requireSupabase } from './supabase-client';

/**
 * Team-mode storage.
 *
 * Bank details are the deliberate exception: they are never sent to the
 * server. They stay in this browser and are read back here so the rest of the
 * app cannot tell the difference. See §1 of PLAN-PHASE-B.md.
 */
const BANK_KEY = 'jcem.bank.v1';
function bankKey(userId: string): string {
  return `${BANK_KEY}.${userId}`;
}

function loadLocalBank(userId: string): BankDetails {
  try {
    const raw = localStorage.getItem(bankKey(userId));
    return raw ? { ...EMPTY_BANK, ...(JSON.parse(raw) as BankDetails) } : EMPTY_BANK;
  } catch {
    return EMPTY_BANK;
  }
}

function saveLocalBank(userId: string, bank: BankDetails): void {
  try {
    localStorage.setItem(bankKey(userId), JSON.stringify(bank));
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
  rate_card_version: string;
  profile_snapshot: Partial<FreelancerProfile> | null;
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

function toInvoice(row: InvoiceRow, profile: FreelancerProfile): Invoice {
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
    rateCardVersion: row.rate_card_version,
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
    const { data, error } = await this.db.auth.getUser();
    if (error) throw new Error(humanise(error));
    if (data.user) {
      this.userId = data.user.id;
      return this.userId;
    }
    throw new Error('You are signed out. Sign in again to continue.');
  }

  async currentUser(): Promise<CurrentUser | null> {
    try {
      const { data } = await this.db.auth.getUser();
      if (data.user) {
        this.userId = data.user.id;

        const { data: row, error } = await this.db
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .maybeSingle<ProfileRow>();
        fail('Could not load your profile', error);
        if (row && !row.active) {
          await this.db.auth.signOut();
          this.userId = null;
          throw new Error('This account has been deactivated. Contact an administrator.');
        }

        return {
          id: data.user.id,
          email: data.user.email ?? row?.email ?? '',
          role: row?.role ?? 'freelancer',
          profile: toProfile(row, loadLocalBank(data.user.id)),
        };
      }
    } catch (error) {
      throw new Error(humanise(error));
    }
    return null;
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    try {
      const { data, error } = await this.db.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      this.userId = data.user.id;
    } catch (error) {
      throw new Error(humanise(error));
    }
  }

  async signUpWithPassword(email: string, password: string): Promise<void> {
    try {
      const normalized = email.trim().toLowerCase();
      const { data: allowed, error: inviteError } = await this.db.rpc('check_invite', { candidate_email: normalized });
      if (inviteError) throw inviteError;
      if (!allowed) throw new Error('This email has not been invited. Ask an administrator for access.');
      const { data, error } = await this.db.auth.signUp({
        email: normalized,
        password,
      });
      if (error) throw error;
      this.userId = data.session?.user.id ?? null;
    } catch (error) {
      throw new Error(humanise(error));
    }
  }

  async updatePassword(password: string): Promise<void> {
    try {
      const { error } = await this.db.auth.updateUser({ password });
      if (error) throw error;
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
    return toProfile(data, loadLocalBank(id));
  }

  async saveProfile(profile: FreelancerProfile): Promise<void> {
    const id = await this.requireUserId();

    // Bank details never leave this browser.
    saveLocalBank(id, profile.bank);

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

    const bank = loadLocalBank(id);
    return (data ?? []).map((row) => toInvoice(row, snapshotProfile(row, toProfile(row.profiles, bank), bank)));
  }

  async saveInvoice(invoice: Invoice): Promise<void> {
    await this.requireUserId();

    const lineRows = invoice.lines
      .map((line) => {
        const item = rateItem(line.rateItemId);
        if (!item) return null;
        return {
          item_key: line.rateItemId,
          template_row: item.row,
          qty: line.qty,
          unit_price: line.unitPrice,
          asana_links: line.asanaLinks.map((l) => l.trim()).filter(Boolean),
          page_links: line.pageLinks.map((l) => l.trim()).filter(Boolean),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const payload = {
      id: invoice.id,
      number: invoice.invoiceNumber,
      period_month: invoice.periodMonth,
      issue_date: invoice.issueDate,
      rate_card_version: invoice.rateCardVersion || this.rateCardVersion,
      profile: {
        fullName: invoice.profile.fullName,
        businessName: invoice.profile.businessName,
        email: invoice.profile.email,
        postalAddress: invoice.profile.postalAddress,
        country: invoice.profile.country,
      },
      lines: lineRows,
    };

    const { error } = await this.db.rpc('save_invoice', { payload });
    fail('Could not save the invoice', error);
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    const { error } = await this.db.rpc('delete_invoice', { target: invoiceId });
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
      toInvoice(row, snapshotProfile(row, toProfile(row.profiles, EMPTY_BANK), EMPTY_BANK)),
    );
  }

  async setStatus(invoiceId: string, to: InvoiceStatus, note?: string): Promise<void> {
    const { error } = await this.db.rpc('transition_invoice', {
      target: invoiceId,
      destination: to,
      note: note ?? null,
    });
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

  async setRole(memberId: string, role: Role, confirmAdmin = false): Promise<void> {
    const { error } = await this.db.rpc('set_member_role', {
      member_id: memberId,
      assigned_role: role,
      confirm_admin: confirmAdmin,
    });
    fail('Could not change that role', error);
  }

  async setActive(memberId: string, active: boolean): Promise<void> {
    const { error } = await this.db.rpc('set_member_active', { member_id: memberId, enabled: active });
    fail(`Could not ${active ? 'activate' : 'deactivate'} that account`, error);
  }

  async listInvites(): Promise<UserInvite[]> {
    const { data, error } = await this.db.from('user_invites').select('*').order('created_at', { ascending: false });
    fail('Could not load invitations', error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      email: row.email as string,
      role: row.role as Role,
      createdAt: row.created_at as string,
      acceptedAt: (row.accepted_at as string | null) ?? undefined,
    }));
  }

  async inviteUser(email: string, role: Role, confirmAdmin = false): Promise<void> {
    const { error } = await this.db.rpc('create_user_invite', {
      candidate_email: email.trim().toLowerCase(),
      assigned_role: role,
      confirm_admin: confirmAdmin,
    });
    fail('Could not authorise that email', error);
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await this.db.rpc('revoke_user_invite', { invite_id: inviteId });
    fail('Could not revoke that invitation', error);
  }

  async listAccessAudit(): Promise<AccessAuditEntry[]> {
    const { data, error } = await this.db.from('access_audit').select('*').order('created_at', { ascending: false }).limit(100);
    fail('Could not load access history', error);
    return (data ?? []).map((row) => ({
      id: Number(row.id), actorId: row.actor_id as string, targetEmail: row.target_email as string,
      action: row.action as string, oldRole: (row.old_role as Role | null) ?? undefined,
      newRole: (row.new_role as Role | null) ?? undefined, createdAt: row.created_at as string,
    }));
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
    const { error } = await this.db.rpc('publish_rate_card', {
      card_version: version,
      items,
    });
    fail('Could not publish the rate card', error);
  }

  async listRateCards(): Promise<RateCardSummary[]> {
    const { data, error } = await this.db
      .from('rate_cards')
      .select('id,version,published_at,rate_items(count)')
      .not('published_at', 'is', null)
      .order('published_at', { ascending: false });
    fail('Could not load rate cards', error);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      version: row.version as string,
      publishedAt: row.published_at as string,
      itemCount: Number((row.rate_items as { count: number }[] | null)?.[0]?.count ?? 0),
    }));
  }

  async deleteRateCard(id: string): Promise<void> {
    const { error } = await this.db.rpc('delete_rate_card', { card_id: id });
    fail('Could not delete the rate card', error);
  }
}

function snapshotProfile(row: InvoiceRow, fallback: FreelancerProfile, bank: BankDetails): FreelancerProfile {
  const snap = row.profile_snapshot;
  if (!snap) return fallback;
  return {
    fullName: snap.fullName ?? fallback.fullName,
    businessName: snap.businessName ?? fallback.businessName,
    email: snap.email ?? fallback.email,
    postalAddress: snap.postalAddress ?? fallback.postalAddress,
    country: snap.country ?? fallback.country,
    bank,
  };
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
