import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COMPANY } from './domain/company';
import { isoDate, monthKey } from './domain/invoice';
import { RATE_CARD_VERSION } from './domain/rate-card';
import { EMPTY_PROFILE, type FreelancerProfile, type Invoice, type InvoiceLine } from './domain/types';
import { validateLine, validateProfile } from './domain/validation';
import { LocalStorageAdapter, storageAvailable } from './store/local';
import type { StorageAdapter } from './store/adapter';
import { BuilderScreen } from './ui/BuilderScreen';
import { DetailsScreen } from './ui/DetailsScreen';
import { HistoryScreen } from './ui/HistoryScreen';
import { ReviewScreen } from './ui/ReviewScreen';

type Step = 'details' | 'build' | 'review' | 'history';

const storage: StorageAdapter = new LocalStorageAdapter();

/** The month you are normally invoicing is the one you are in. */
function defaultPeriod(): string {
  return monthKey(new Date());
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState<Step>('details');

  const [profile, setProfile] = useState<FreelancerProfile>(EMPTY_PROFILE);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState(1);
  const [issueDate, setIssueDate] = useState(() => isoDate(new Date()));
  const [periodMonth, setPeriodMonth] = useState(defaultPeriod);
  const [invoiceId, setInvoiceId] = useState(() => newId());
  const [history, setHistory] = useState<Invoice[]>([]);

  const persists = useMemo(storageAvailable, []);
  const hydrated = useRef(false);

  // ---- Load saved state ----------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
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

      // Land people on the first screen that still needs them.
      if (savedProfile && validateProfile(savedProfile).every((i) => i.severity !== 'error')) {
        setStep('build');
      }

      hydrated.current = true;
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
      rateCardVersion: RATE_CARD_VERSION,
      createdAt: new Date().toISOString(),
    }),
    [invoiceId, invoiceNumber, issueDate, periodMonth, profile, lines],
  );

  const detailsComplete = validateProfile(profile).every((i) => i.severity !== 'error');
  const linesComplete =
    lines.length > 0 && lines.every((l) => validateLine(l).every((i) => i.severity !== 'error'));

  const recordInvoice = useCallback(async (finished: Invoice) => {
    await storage.saveInvoice(finished);
    setHistory(await storage.listInvoices());
  }, []);

  const reopen = useCallback((old: Invoice) => {
    setProfile(old.profile);
    setLines(old.lines.map((l) => ({ ...l, key: `${l.rateItemId}-${Date.now()}-${Math.random()}` })));
    setPeriodMonth(old.periodMonth);
    setIssueDate(old.issueDate);
    setInvoiceNumber(old.invoiceNumber);
    setInvoiceId(old.id);
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
    await storage.saveDraft(null);
    setStep('build');
  }, [lines.length]);

  const removeFromHistory = useCallback(async (id: string) => {
    await storage.deleteInvoice(id);
    setHistory(await storage.listInvoices());
  }, []);

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

  return (
    <div className="app">
      <Topbar onNew={startNew} />

      <nav className="steps no-print" aria-label="Invoice steps">
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
          />
        )}

        {step === 'history' && (
          <HistoryScreen
            invoices={history}
            onReopen={reopen}
            onDelete={(id) => void removeFromHistory(id)}
          />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Topbar({ onNew }: { onNew?: () => void }) {
  return (
    <header className="topbar no-print">
      <img className="topbar__logo" src="logo-dark.png" alt={COMPANY.name} />
      <span className="topbar__title">Freelancer Invoicing</span>
      <div className="topbar__spacer" />
      {onNew && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={onNew}>
          New invoice
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
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
