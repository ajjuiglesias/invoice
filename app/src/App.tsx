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
import { isEditable, needsDecision, type InvoiceStatus, type Role } from './domain/status';
import { EMPTY_PROFILE, type FreelancerProfile, type Invoice, type InvoiceLine } from './domain/types';
import { validateLine, validateProfile } from './domain/validation';
import type { AccessAuditEntry, CurrentUser, StorageAdapter, TeamAdapter, TeamMember, UserInvite } from './store/adapter';
import { LocalStorageAdapter, storageAvailable } from './store/local';
import { migrateLocalData } from './store/migrate';
import { AccountsScreen } from './ui/AccountsScreen';
import { AdminLayout, type AdminSection } from './ui/AdminLayout';
import { AdminScreen } from './ui/AdminScreen';
import { AuthScreen, PasswordSetupScreen } from './ui/AuthScreen';
import { BuilderScreen } from './ui/BuilderScreen';
import { Notice } from './ui/components';
import { DetailsScreen } from './ui/DetailsScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { ReviewQueueScreen } from './ui/ReviewQueueScreen';
import { ReviewScreen } from './ui/ReviewScreen';

type Step = 'details' | 'build' | 'review' | 'history' | 'approvals' | 'accounts' | 'admin' | 'admin-history';

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
  const [authError, setAuthError] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.search).get('reset-password') === '1',
  );
  const [queue, setQueue] = useState<Invoice[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [accessAudit, setAccessAudit] = useState<AccessAuditEntry[]>([]);
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

  const [adminTab, setAdminTab] = useState<'rates' | 'team'>('rates');

  const role: Role = user?.role ?? 'freelancer';
  const canReview = role === 'manager' || role === 'accounts' || role === 'admin';
  const seesAccounts = role === 'accounts' || role === 'admin';
  const isAdmin = role === 'admin';
  const isStaff = canReview || seesAccounts || isAdmin;

  const pendingApprovalsCount = useMemo(
    () => queue.filter((i) => needsDecision(i.status ?? 'draft')).length,
    [queue],
  );

  // ---- Authentication ------------------------------------------------------
  useEffect(() => {
    if (!teamMode) return;
    let unsubscribe: (() => void) | undefined;

    void initBackend()
      .then(async () => {
        if (!cloud) return;
        setUser(await cloud.currentUser());
        unsubscribe = cloud.onAuthChange(() => {
          void cloud?.currentUser().then(setUser).catch((error) => {
            setAuthError(error instanceof Error ? error.message : 'Could not verify your session.');
          });
        });
      })
      .catch((error) => {
        setAuthError(error instanceof Error ? error.message : 'Could not connect to the invoicing service.');
      })
      .finally(() => setAuthChecked(true));

    return () => unsubscribe?.();
  }, []);

  // ---- Load saved state ----------------------------------------------------
  useEffect(() => {
    if (teamMode && !user) return;
    let cancelled = false;

    void (async () => {
      hydrated.current = false;
      try {
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

      if (user?.role === 'admin' || user?.role === 'manager') {
        setStep('approvals');
      } else if (user?.role === 'accounts') {
        setStep('accounts');
      } else if (savedProfile && validateProfile(savedProfile).every((i) => i.severity !== 'error')) {
        setStep('build');
      } else {
        setStep('details');
      }

        hydrated.current = true;
      } catch (error) {
        if (!cancelled) {
          setBanner(error instanceof Error ? error.message : 'Could not load your invoice workspace.');
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ---- Persist as you go ---------------------------------------------------
  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      void storage.saveProfile(profile).catch((error) => {
        setBanner(error instanceof Error ? error.message : 'Could not save your details.');
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [profile]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = window.setTimeout(() => {
      void storage.saveDraft({ invoiceNumber, issueDate, periodMonth, lines }).catch((error) => {
        setBanner(error instanceof Error ? error.message : 'Could not save your draft.');
      });
    }, 400);
    return () => window.clearTimeout(timer);
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
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not load the approval queue.');
    } finally {
      setTeamBusy(false);
    }
  }, []);

  const refreshMembers = useCallback(async () => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      const [nextMembers, nextInvites, nextAudit] = await Promise.all([
        cloud.listMembers(), cloud.listInvites(), cloud.listAccessAudit(),
      ]);
      setMembers(nextMembers);
      setInvites(nextInvites);
      setAccessAudit(nextAudit);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not load the team.');
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
    async (memberId: string, next: Role, confirmAdmin = false) => {
      if (!cloud) return;
      setTeamBusy(true);
      try {
        await cloud.setRole(memberId, next, confirmAdmin);
        await refreshMembers();
      } catch (error) {
        setBanner(error instanceof Error ? error.message : 'Could not change that role.');
      } finally {
        setTeamBusy(false);
      }
    },
    [refreshMembers],
  );

  const setMemberActive = useCallback(async (memberId: string, active: boolean) => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      await cloud.setActive(memberId, active);
      await refreshMembers();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not change account access.');
    } finally { setTeamBusy(false); }
  }, [refreshMembers]);

  const inviteUser = useCallback(async (email: string, inviteRole: Role, confirmAdmin = false) => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      await cloud.inviteUser(email, inviteRole, confirmAdmin);
      await refreshMembers();
    } finally { setTeamBusy(false); }
  }, [refreshMembers]);

  const revokeInvite = useCallback(async (inviteId: string) => {
    if (!cloud) return;
    setTeamBusy(true);
    try {
      await cloud.revokeInvite(inviteId);
      await refreshMembers();
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not revoke that invitation.');
    } finally { setTeamBusy(false); }
  }, [refreshMembers]);

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
    try {
      await cloud?.signOut();
      setUser(null);
      setReady(false);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : 'Could not sign out.');
    }
  }, []);

  const handleAdminNavigate = useCallback(
    (section: AdminSection) => {
      if (section === 'approvals') {
        setStep('approvals');
      } else if (section === 'accounts') {
        setStep('accounts');
      } else if (section === 'admin-rates') {
        setAdminTab('rates');
        setStep('admin');
      } else if (section === 'admin-team') {
        setAdminTab('team');
        setStep('admin');
      } else if (section === 'history') {
        setStep('admin-history');
      } else if (section === 'build') {
        void startNew();
      }
    },
    [startNew],
  );

  const handleAdminRefresh = useCallback(() => {
    if (step === 'approvals') void refreshQueue();
    else if (step === 'accounts') {
      void refreshQueue();
      void refreshMembers();
    } else if (step === 'admin') {
      void refreshMembers();
    }
  }, [step, refreshQueue, refreshMembers]);

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

  if (teamMode && passwordRecovery) {
    return (
      <div className="app">
        <PasswordSetupScreen
          onSave={async (password) => {
            if (!cloud) throw new Error('The invoicing service is unavailable. Please refresh and try again.');
            await cloud.updatePassword!(password);
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('reset-password');
            window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
            setPasswordRecovery(false);
            setUser(await cloud.currentUser());
            setBanner('Your password has been saved.');
          }}
        />
      </div>
    );
  }

  if (teamMode && !user) {
    return (
      <div className="app">
        {authError && <div className="auth-global-error"><Notice tone="error">{authError}</Notice></div>}
        <AuthScreen
          onMagicLink={async (email) => {
            setAuthError(null);
            if (!cloud) throw new Error('The invoicing service is unavailable. Please refresh and try again.');
            await cloud.signInWithEmail(email);
          }}
          onSignIn={async (email, password) => {
            setAuthError(null);
            if (!cloud) throw new Error('The invoicing service is unavailable. Please refresh and try again.');
            await cloud.signInWithPassword!(email, password);
            const current = await cloud.currentUser();
            if (current) setUser(current);
          }}
          onSignUp={async (email, password) => {
            setAuthError(null);
            if (!cloud) throw new Error('The invoicing service is unavailable. Please refresh and try again.');
            await cloud.signUpWithPassword!(email, password);
            const current = await cloud.currentUser();
            if (current) setUser(current);
          }}
          onResetPassword={async (email) => {
            if (!cloud) throw new Error('The invoicing service is unavailable. Please refresh and try again.');
            await cloud.requestPasswordReset!(email);
          }}
        />
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

  const inAdminShell =
    step === 'approvals' || step === 'accounts' || step === 'admin' || step === 'admin-history';

  if (inAdminShell) {
    const currentAdminSection: AdminSection =
      step === 'approvals'
        ? 'approvals'
        : step === 'accounts'
        ? 'accounts'
        : step === 'admin-history'
        ? 'history'
        : adminTab === 'team'
        ? 'admin-team'
        : 'admin-rates';

    return (
      <AdminLayout
        currentSection={currentAdminSection}
        onNavigate={handleAdminNavigate}
        user={user}
        onSignOut={() => void signOut()}
        pendingApprovalsCount={pendingApprovalsCount}
        activeRateCardVersion={activeRateCardVersion()}
        onNewInvoice={() => void startNew()}
        busy={teamBusy}
        onRefresh={handleAdminRefresh}
      >
        {banner && (
          <div style={{ marginBottom: 16 }}>
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
            invites={invites}
            accessAudit={accessAudit}
            busy={teamBusy}
            onPublishRateCard={publishRateCard}
            onSetRole={setMemberRole}
            onSetActive={setMemberActive}
            onInviteUser={inviteUser}
            onRevokeInvite={revokeInvite}
            onRefresh={() => void refreshMembers()}
            initialTab={adminTab}
            onTabChange={setAdminTab}
          />
        )}

        {step === 'admin-history' && (
          <HistoryScreen
            invoices={history}
            onEdit={editInvoice}
            onCopyToNewMonth={(inv) => void copyToNewMonth(inv)}
            onDelete={(id) => void removeFromHistory(id)}
          />
        )}
      </AdminLayout>
    );
  }

  const locked = !isEditable(status);

  return (
    <div className="app">
      <Topbar
        onNew={startNew}
        user={user}
        onSignOut={() => void signOut()}
        isStaff={isStaff}
        pendingCount={pendingApprovalsCount}
        onOpenAdmin={() => setStep(isAdmin ? 'admin' : canReview ? 'approvals' : 'accounts')}
      />

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
            onClick={() => setStep('approvals')}
          >
            Approvals
            {pendingApprovalsCount > 0 && (
              <span
                className="admin-nav__counter admin-nav__counter--active"
                style={{ marginLeft: 6 }}
              >
                {pendingApprovalsCount}
              </span>
            )}
          </button>
        )}
        {seesAccounts && (
          <button
            type="button"
            className="step"
            onClick={() => setStep('accounts')}
          >
            Accounts
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className="step"
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

        {locked && (
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
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Topbar({
  onNew,
  user,
  onSignOut,
  isStaff,
  pendingCount = 0,
  onOpenAdmin,
}: {
  onNew?: () => void;
  user?: CurrentUser | null;
  onSignOut?: () => void;
  isStaff?: boolean;
  pendingCount?: number;
  onOpenAdmin?: () => void;
}) {
  return (
    <header className="topbar no-print">
      <img className="topbar__logo" src="logo-dark.png" alt={COMPANY.name} />
      <span className="topbar__title">Freelancer Invoicing</span>
      <div className="topbar__spacer" />

      {isStaff && onOpenAdmin && (
        <button
          type="button"
          className="topbar__staff-badge"
          onClick={onOpenAdmin}
          title="Open Management & Admin Portal"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ width: 14, height: 14 }}
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
          <span>Admin Portal</span>
          {pendingCount > 0 && (
            <span className="admin-nav__counter admin-nav__counter--active">
              {pendingCount}
            </span>
          )}
        </button>
      )}

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
