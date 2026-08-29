import { useMemo, useState } from 'react';
import { formatGBP } from '../domain/invoice';
import { activeRateCard, activeRateCardVersion, type RateItem } from '../domain/rate-card';
import type { Role } from '../domain/status';
import type { TeamMember } from '../store/adapter';
import { Card, Field, Notice } from './components';

interface Props {
  members: TeamMember[];
  busy: boolean;
  onPublishRateCard: (version: string, items: RateItem[]) => Promise<void>;
  onSetRole: (memberId: string, role: Role) => Promise<void>;
  onRefresh: () => void;
}

const ROLES: Role[] = ['freelancer', 'manager', 'accounts', 'admin'];

/**
 * Rates and people.
 *
 * Publishing writes a new versioned card rather than editing the old one, so
 * invoices already raised keep the prices they were raised at.
 */
export function AdminScreen({ members, busy, onPublishRateCard, onSetRole, onRefresh }: Props) {
  const current = useMemo(() => activeRateCard(), []);
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(current.map((i) => [i.id, i.price])),
  );
  const [version, setVersion] = useState(() => suggestVersion(activeRateCardVersion()));
  const [status, setStatus] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const changed = current.filter((item) => prices[item.id] !== item.price);
  const invalid = current.some((item) => !(prices[item.id] > 0));

  const publish = async () => {
    setStatus(null);
    try {
      await onPublishRateCard(
        version.trim(),
        current.map((item) => ({ ...item, price: prices[item.id] })),
      );
      setStatus({
        tone: 'info',
        text: `Published ${version.trim()}. New invoices will use these prices; existing ones keep theirs.`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not publish the rate card.',
      });
    }
  };

  return (
    <>
      <div className="screen-head">
        <h1>Admin</h1>
        <p>
          Change what each task type pays, and who can approve invoices. Publishing a rate card
          creates a new version — invoices already raised keep the prices they were raised at.
        </p>
      </div>

      {status && <Notice tone={status.tone === 'error' ? 'error' : 'info'}>{status.text}</Notice>}

      <Card
        title="Rate card"
        subtitle={`In force: ${activeRateCardVersion()}`}
        aside={
          <span className="small muted">
            {changed.length === 0
              ? 'No changes'
              : `${changed.length} price${changed.length === 1 ? '' : 's'} changed`}
          </span>
        }
      >
        <Notice tone="info" title="Template rows are fixed. ">
          Each task type is pinned to a row in the company workbook, whose subtotal is
          <code> SUM(J19:J47)</code>. Prices are editable here; rows are not.
        </Notice>

        <div style={{ overflowX: 'auto' }}>
          <table className="rate-editor">
            <thead>
              <tr>
                <th>Task type</th>
                <th>Group</th>
                <th style={{ width: 70 }}>Row</th>
                <th style={{ width: 130 }}>Price</th>
                <th style={{ width: 110 }}>Was</th>
              </tr>
            </thead>
            <tbody>
              {current.map((item) => {
                const isChanged = prices[item.id] !== item.price;
                return (
                  <tr key={item.id} className={isChanged ? 'rate-editor__changed' : undefined}>
                    <td>
                      <strong>{item.short}</strong>
                      {item.customPrice && (
                        <span className="picker__hint">Freelancer sets their own price</span>
                      )}
                    </td>
                    <td className="small muted">{item.group}</td>
                    <td className="rate-editor__row">{item.row}</td>
                    <td>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={prices[item.id]}
                        aria-label={`Price for ${item.short}`}
                        aria-invalid={!(prices[item.id] > 0) || undefined}
                        onChange={(e) =>
                          setPrices({ ...prices, [item.id]: Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="small muted">{isChanged ? formatGBP(item.price) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid" style={{ marginTop: 18 }}>
          <Field label="New version name" hint="Shown against every invoice raised under it">
            <input type="text" value={version} onChange={(e) => setVersion(e.target.value)} />
          </Field>
        </div>

        <div className="actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || invalid || changed.length === 0 || !version.trim()}
            onClick={() => void publish()}
          >
            {busy && <span className="spinner" aria-hidden="true" />}
            Publish {changed.length > 0 ? `${changed.length} change${changed.length === 1 ? '' : 's'}` : ''}
          </button>
          {changed.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setPrices(Object.fromEntries(current.map((i) => [i.id, i.price])))}
            >
              Discard changes
            </button>
          )}
        </div>
        {invalid && (
          <p className="small" style={{ color: 'var(--red)', marginTop: 10 }}>
            Every price must be more than £0.
          </p>
        )}
      </Card>

      <Card
        title={`People${members.length ? ` (${members.length})` : ''}`}
        aside={
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={busy}>
            Refresh
          </button>
        }
      >
        {members.length === 0 ? (
          <p className="empty">Nobody has signed in yet.</p>
        ) : (
          <table className="history">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th style={{ width: 170 }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.fullName || '—'}</strong>
                    {member.businessName && (
                      <span className="picker__hint">{member.businessName}</span>
                    )}
                  </td>
                  <td className="small muted">{member.email}</td>
                  <td>
                    <select
                      value={member.role}
                      disabled={busy}
                      aria-label={`Role for ${member.fullName || member.email}`}
                      onChange={(e) => void onSetRole(member.id, e.target.value as Role)}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

/** "2026-08" becomes "2026-09"; anything else just gets a suffix. */
function suggestVersion(current: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(current);
  if (!match) return `${current}-revised`;
  const [, year, month] = match;
  const date = new Date(Number(year), Number(month), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
