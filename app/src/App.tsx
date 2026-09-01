import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teamMode } from './config';
import { COMPANY } from './domain/company';
import { isoDate, monthKey, nextMonth } from './domain/invoice';
import {
  activeRateCardVersion,
  RATE_CARD_VERSION,
  setActiveRateCard,
  type RateItem,
} from './domain/rate-card';
import { isEditable, type InvoiceStatus, type Role } from './domain/status';
import { EMPTY_PROFILE, type FreelancerProfile, type Invoice, type InvoiceLine } from './domain/types';
import { validateLine, validateProfile } from './domain/validation';
import type { CurrentUser, StorageAdapter, TeamAdapter, TeamMember } from './store/adapter';
import { LocalStorageAdapter, storageAvailable } from './store/local';
import { migrateLocalData } from './store/migrate';
import { AccountsScreen } from './ui/AccountsScreen';
import { AdminScreen } from './ui/AdminScreen';
import { AuthScreen } from './ui/AuthScreen';
import { BuilderScreen } from './ui/BuilderScreen';
import { Notice } from './ui/components';
import { DetailsScreen } from './ui/DetailsScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { ReviewQueueScreen } from './ui/ReviewQueueScreen';
import { ReviewScreen } from './ui/ReviewScreen';

type Step = 'details' | 'build' | 'review' | 'history' | 'approvals' | 'accounts' | 'admin';

/**
 * One backend or the other, chosen once at start-up.
 *
 * Without Supabase credentials this is Phase A exactly: everything in the
 * browser, no accounts, nothing uploaded — and the Supabase client is never
 * even downloaded, because the import below only runs in team mode.
 */
let cloud: (StorageAdapter & TeamAdapter) | null = null;
let storage: StorageAdapter = new LocalStorageAdapter();

let backendPromise: Promise<void> | null = null;

function initBackend(): Promise<void> {
  if (!teamMode) return Promise.resolve();
  if (!backendPromise) {
    backendPromise = import('./store/supabase').then(({ SupabaseAdapter }) => {
      cloud = new SupabaseAdapter(RATE_CARD_VERSION);
      storage = cloud;
    });
  }
  return backendPromise;
}

function defaultPeriod(): string {
  return monthKey(new Date());
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>('details');
  const [banner, setBanner] = useState<string | null>(null);

  // Team mode only.
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [authChecked, setAuthChecked] = useState(!teamMode);
  const [queue, setQueue] = useState<Invoice[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamBusy, setTeamBusy] = useState(false);

  const [profile, setProfile] = useState<FreelancerProfile>(EMPTY_PROFILE);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState(1);
  const [issueDate, setIssueDate] = useState(() => isoDate(new Date()));
  const [periodMonth, setPeriodMonth] = useState(defaultPeriod);
  const [invoiceId, setInvoiceId] = useState(() => newId());
  const [status, setStatus] = useState<InvoiceStatus>('draft');
  const [history, setHistory] = useState<Invoice[]>([]);

  const persists = useMemo(storageAvailable, []);
  const hydrated = useRef(false);

  const role: Role = user?.role ?? 'freelancer';
  const canReview = role === 'manager' || role === 'accounts' || role === 'admin';
  const seesAccounts = role === 'accounts' || role === 'admin';
  const isAdmin = role === 'admin';

  // ---- Authentication ------------------------------------------------------
  useEffect(() => {
    if (!teamMode) return;
    let unsubscribe: (() => void) | undefined;

    void initBackend().then(async () => {
      if (!cloud) return;

      setUser(await cloud.currentUser());
      setAuthChecked(true);

      unsubscribe = cloud.onAuthChange(() => {
        void cloud?.currentUser().then(setUser);
      });
    });

    return () => unsubscribe?.();
  }, []);

  // ---- Load saved state ----------------------------------------------------
  useEffect(() => {
    if (teamMode && !user) return;
    let cancelled = false;

    (async () => {
      hydrated.current = false;

      if (cloud && user) {
        // Published rates win over the ones compiled into the app.
        try {
          const published = await cloud.loadPublishedRateCard();
          if (published) setActiveRateCard(published.items, published.version);
        } catch {
          // Fall back to the built-in card rather than block sign-in.
        }

        const moved = await migrateLocalData(cloud);
        if (moved.migrated && !cancelled) {
          setBanner(
            `Brought your existing work across: ${moved.invoices} invoice${
              moved.invoices === 1 ? '' : 's'
            }${moved.profile ? ' and your details' : ''}.`,
          );
        }
      }

      const [savedProfile, draft, invoices, next] = await Promise.all([
        storage.loadProfile(),
        storage.loadDraft(),
        storage.listInvoices(),
        storage.nextInvoiceNumber(),
      ]);
      if (cancelled) return;

      if (savedProfile) setProfile(savedProfile);
      setHistory(invoices);

      if (draft) {
        setLines(draft.lines);
        setInvoiceNumber(draft.invoiceNumber);
        setIssueDate(draft.issueDate);
        setPeriodMonth(draft.periodMonth);
      } else {
        setInvoiceNumber(next);
      }

      if (savedProfile && validateProfile(savedProfile).every((i) => i.severity !== 'error')) {
        setStep('build');
      }

      hydrated.current = true;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---- Persist as you go ---------------------------------------------------
  useEffect(() => {
    if (!hydrated.current) return;
    void storage.saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!hydrated.current) return;
    void storage.saveDraft({ invoiceNumber, issueDate, periodMonth, lines });
  }, [invoiceNumber, issueDate, periodMonth, lines]);

  // ---- Derived -------------------------------------------------------------
  const invoice: Invoice = useMemo(
    () => ({
      id: invoiceId,
      invoiceNumber,
      issueDate,
      periodMonth,
      profile,
      lines,
      rateCardVersion: activeRateCardVersion(),
      createdAt: new Date().toISOString(),
      status,
      freelancerId: user?.id,
    }),
    [invoiceId, invoiceNumber, issueDate, periodMonth, profile, lines, status, user?.id],
  );

  const detailsComplete = validateProfile(profile).every((i) => i.severity !== 'error');
  const linesComplete =
    lines.length > 0 && lines.every((l) => validateLine(l).every((i) => i.severity !== 'error'));

  // ---- Actions -------------------------------------------------------------
  const recordInvoice = useCallback(async (finished: Invoice) => {
    await storage.saveInvoice(finished);
    setHistory(await storage.listInvoices());
  }, []);

  const refreshQueue = useCallback(async () => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      setQueue(await cloud.listForReview());
    } finally {
      setTeamBusy(false);
    }
  }, []);

  const refreshMembers = useCallback(async () => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      setMembers(await cloud.listMembers());
    } finally {
      setTeamBusy(false);
    }
  }, []);

  useEffect(() => {
    if (step === 'approvals') void refreshQueue();
    if (step === 'admin') void refreshMembers();
    if (step === 'accounts') {
      void refreshQueue();
      void refreshMembers();
    }
  }, [step, refreshQueue, refreshMembers]);

  const submitForApproval = useCallback(async () => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      await storage.saveInvoice(invoice);
      await cloud.setStatus(invoice.id, 'submitted');
      setStatus('submitted');
      setHistory(await storage.listInvoices());
      setBanner('Submitted for approval.');
      setStep('history');
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not submit the invoice.');
    } finally {
      setTeamBusy(false);
    }
  }, [invoice]);

  const decide = useCallback(
    async (target: Invoice, to: InvoiceStatus, note?: string) => {
      if (!cloud) return;
      setTeamBusy(true);
      try {
        await cloud.setStatus(target.id, to, note);
        setQueue(await cloud.listForReview());
      } catch (error) {
        setBanner(error instanceof Error ? error.message : 'Could not update that invoice.');
      } finally {
        setTeamBusy(false);
      }
    },
    [],
  );

  const publishRateCard = useCallback(async (version: string, items: RateItem[]) => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      await cloud.publishRateCard(version, items);
      setActiveRateCard(items, version);
    } finally {
      setTeamBusy(false);
    }
  }, []);

  const setMemberRole = useCallback(
    async (memberId: string, next: Role) => {
      if (!cloud) return;
      setTeamBusy(true);
      try {
        await cloud.setRole(memberId, next);
        setMembers(await cloud.listMembers());
      } catch (error) {
        setBanner(error instanceof Error ? error.message : 'Could not change that role.');
      } finally {
        setTeamBusy(false);
      }
    },
    [],
  );

  const rekey = (source: InvoiceLine[]) =>
    source.map((l) => ({ ...l, key: `${l.rateItemId}-${Date.now()}-${Math.random()}` }));

  const editInvoice = useCallback((old: Invoice) => {
    setProfile(old.profile);
    setLines(rekey(old.lines));
    setPeriodMonth(old.periodMonth);
    setIssueDate(old.issueDate);
    setInvoiceNumber(old.invoiceNumber);
    setInvoiceId(old.id);
    setStatus(old.status ?? 'draft');
    setStep('build');
  }, []);

  const copyToNewMonth = useCallback(async (old: Invoice) => {
    setProfile(old.profile);
    setLines(rekey(old.lines).map((l) => ({ ...l, asanaLinks: [''], pageLinks: [''] })));
    setPeriodMonth(nextMonth(old.periodMonth));
    setIssueDate(isoDate(new Date()));
    setInvoiceNumber(await storage.nextInvoiceNumber());
    setInvoiceId(newId());
    setStatus('draft');
    setStep('build');
  }, []);

  const startNew = useCallback(async () => {
    if (lines.length > 0 && !window.confirm('Start a new invoice? The current one will be cleared.'))
      return;
    setLines([]);
    setInvoiceId(newId());
    setPeriodMonth(defaultPeriod());
    setIssueDate(isoDate(new Date()));
    setInvoiceNumber(await storage.nextInvoiceNumber());
    setStatus('draft');
    await storage.saveDraft(null);
    setStep('build');
  }, [lines.length]);

  const removeFromHistory = useCallback(async (id: string) => {
    await storage.deleteInvoice(id);
    setHistory(await storage.listInvoices());
  }, []);

  const signOut = useCallback(async () => {
    await cloud?.signOut();
    setUser(null);
    setReady(false);
  }, []);

  // ---- Render --------------------------------------------------------------

  if (teamMode && !authChecked) {
    return (
      <div className="app">
        <Topbar />
        <main>
          <p className="empty">Loading…</p>
        </main>
      </div>
    );
  }

  if (teamMode && !user) {
    return (
      <div className="app">
        <AuthScreen onSignIn={(email) => cloud!.signInWithEmail(email)} />
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="app">
        <Topbar />
        <main>
          <p className="empty">Loading…</p>
        </main>
      </div>
    );
  }

  const locked = !isEditable(status);

  return (
    <div className="app">
      <Topbar onNew={startNew} user={user} onSignOut={() => void signOut()} />

      <nav className="steps no-print" aria-label="Sections">
        <StepButton
          n={1}
          label="Your details"
          active={step === 'details'}
          done={detailsComplete}
          onClick={() => setStep('details')}
        />
        <StepButton
          n={2}
          label="Build invoice"
          active={step === 'build'}
          done={linesComplete}
          disabled={!detailsComplete}
          onClick={() => setStep('build')}
        />
        <StepButton
          n={3}
          label="Review & send"
          active={step === 'review'}
          done={false}
          disabled={!detailsComplete || !linesComplete}
          onClick={() => setStep('review')}
        />
        <div className="topbar__spacer" />
        {canReview && (
          <button
            type="button"
            className="step"
            aria-current={step === 'approvals'}
            onClick={() => setStep('approvals')}
          >
            Approvals
          </button>
        )}
        {seesAccounts && (
          <button
            type="button"
            className="step"
            aria-current={step === 'accounts'}
            onClick={() => setStep('accounts')}
          >
            Accounts
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className="step"
            aria-current={step === 'admin'}
            onClick={() => setStep('admin')}
          >
            Admin
          </button>
        )}
        <button
          type="button"
          className="step"
          aria-current={step === 'history'}
          onClick={() => setStep('history')}
        >
          Past invoices
        </button>
      </nav>

      <main>
        {banner && (
          <div className="no-print">
            <Notice tone="info">
              {banner}{' '}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ marginLeft: 8 }}
                onClick={() => setBanner(null)}
              >
                Dismiss
              </button>
            </Notice>
          </div>
        )}

        {locked && step !== 'approvals' && step !== 'admin' && step !== 'accounts' && (
          <div className="no-print">
            <Notice tone="warning" title="This invoice is locked. ">
              It has been submitted, so it cannot be edited. Use <strong>New invoice</strong> to
              start another.
            </Notice>
          </div>
        )}

        {step === 'details' && (
          <DetailsScreen
            profile={profile}
            onChange={setProfile}
            onContinue={() => setStep('build')}
            storagePersists={persists}
          />
        )}

        {step === 'build' && (
          <BuilderScreen
            invoiceNumber={invoiceNumber}
            issueDate={issueDate}
            periodMonth={periodMonth}
            lines={lines}
            onMetaChange={(meta) => {
              if (meta.invoiceNumber !== undefined) setInvoiceNumber(meta.invoiceNumber);
              if (meta.issueDate !== undefined) setIssueDate(meta.issueDate);
              if (meta.periodMonth !== undefined) setPeriodMonth(meta.periodMonth);
            }}
            onLinesChange={setLines}
            onBack={() => setStep('details')}
            onContinue={() => setStep('review')}
          />
        )}

        {step === 'review' && (
          <ReviewScreen
            invoice={invoice}
            onBack={() => setStep('build')}
            onRecord={(finished) => void recordInvoice(finished)}
            onSubmit={teamMode ? () => void submitForApproval() : undefined}
            submitting={teamBusy}
          />
        )}

        {step === 'history' && (
          <HistoryScreen
            invoices={history}
            onEdit={editInvoice}
            onCopyToNewMonth={(inv) => void copyToNewMonth(inv)}
            onDelete={(id) => void removeFromHistory(id)}
          />
        )}

        {step === 'approvals' && canReview && (
          <ReviewQueueScreen
            invoices={queue}
            role={role}
            currentUserId={user?.id ?? ''}
            busy={teamBusy}
            onDecide={decide}
            onRefresh={() => void refreshQueue()}
          />
        )}

        {step === 'accounts' && seesAccounts && (
          <AccountsScreen
            invoices={queue}
            members={members}
            busy={teamBusy}
            onRefresh={() => {
              void refreshQueue();
              void refreshMembers();
            }}
          />
        )}

        {step === 'admin' && isAdmin && (
          <AdminScreen
            members={members}
            busy={teamBusy}
            onPublishRateCard={publishRateCard}
            onSetRole={setMemberRole}
            onRefresh={() => void refreshMembers()}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Topbar({
  onNew,
  user,
  onSignOut,
}: {
  onNew?: () => void;
  user?: CurrentUser | null;
  onSignOut?: () => void;
}) {
  return (
    <header className="topbar no-print">
      <img className="topbar__logo" src="logo-dark.png" alt={COMPANY.name} />
      <span className="topbar__title">Freelancer Invoicing</span>
      <div className="topbar__spacer" />

      {user && (
        <span className="whoami">
          {user.email}
          <span className="whoami__role">{user.role}</span>
        </span>
      )}

      {onNew && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onNew}>
          New invoice
        </button>
      )}

      {user && onSignOut && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </header>
  );
}

function StepButton({
  n,
  label,
  active,
  done,
  disabled,
  onClick,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="step"
      aria-current={active}
      disabled={disabled}
      onClick={onClick}
    >
      <span className={`step__num${done && !active ? ' step__num--done' : ''}`}>
        {done && !active ? '✓' : n}
      </span>
      {label}
    </button>
  );
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
