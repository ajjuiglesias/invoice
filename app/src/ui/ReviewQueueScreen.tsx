import { useMemo, useState } from 'react';
import { formatDate, formatGBP, lineAmount, monthLabel, subtotal } from '../domain/invoice';
import { rateItem } from '../domain/rate-card';
import {
  allowedTransitions,
  needsDecision,
  STATUS_LABEL,
  STATUS_TONE,
  type InvoiceStatus,
  type Role,
} from '../domain/status';
import type { Invoice } from '../domain/types';
import { Card, Notice } from './components';

interface Props {
  invoices: Invoice[];
  role: Role;
  currentUserId: string;
  busy: boolean;
  onDecide: (invoice: Invoice, to: InvoiceStatus, note?: string) => Promise<void>;
  onRefresh: () => void;
}

/**
 * What a line manager sees instead of a mailbox: every submitted invoice, its
 * lines, and the Asana and page links they need in order to check the work.
 */
export function ReviewQueueScreen({
  invoices,
  role,
  currentUserId,
  busy,
  onDecide,
  onRefresh,
}: Props) {
  const waiting = useMemo(() => invoices.filter((i) => needsDecision(i.status ?? 'draft')), [invoices]);
  const decided = useMemo(
    () => invoices.filter((i) => !needsDecision(i.status ?? 'draft')),
    [invoices],
  );

  return (
    <>
      <div className="screen-head">
        <h1>Approvals</h1>
        <p>
          Every invoice submitted for approval, with the Asana task and published page for each
          line so you can check the work without leaving this page.
        </p>
      </div>

      <div className="actions actions--end" style={{ marginBottom: 14 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={busy}>
          Refresh
        </button>
      </div>

      <Card title={`Waiting on you${waiting.length ? ` (${waiting.length})` : ''}`}>
        {waiting.length === 0 ? (
          <p className="empty">Nothing waiting. Everything submitted has been dealt with.</p>
        ) : (
          waiting.map((invoice) => (
            <QueueItem
              key={invoice.id}
              invoice={invoice}
              role={role}
              currentUserId={currentUserId}
              busy={busy}
              onDecide={onDecide}
              defaultOpen
            />
          ))
        )}
      </Card>

      {decided.length > 0 && (
        <Card title={`Everything else (${decided.length})`}>
          {decided.map((invoice) => (
            <QueueItem
              key={invoice.id}
              invoice={invoice}
              role={role}
              currentUserId={currentUserId}
              busy={busy}
              onDecide={onDecide}
            />
          ))}
        </Card>
      )}
    </>
  );
}

function QueueItem({
  invoice,
  role,
  currentUserId,
  busy,
  onDecide,
  defaultOpen = false,
}: {
  invoice: Invoice;
  role: Role;
  currentUserId: string;
  busy: boolean;
  onDecide: (invoice: Invoice, to: InvoiceStatus, note?: string) => Promise<void>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [note, setNote] = useState('');
  const [askingForChanges, setAskingForChanges] = useState(false);

  const status = invoice.status ?? 'draft';
  const isOwner = invoice.freelancerId === currentUserId;
  const actions = allowedTransitions(status, role, isOwner);

  const who = invoice.profile.businessName.trim() || invoice.profile.fullName.trim() || 'Unknown';

  const requestChanges = async () => {
    if (!note.trim()) return;
    await onDecide(invoice, 'changes_requested', note.trim());
    setNote('');
    setAskingForChanges(false);
  };

  return (
    <div className="queue__item">
      <div className="queue__head">
        <span className="queue__who">
          {who}
          <span>
            {monthLabel(invoice.periodMonth)} · Invoice #{invoice.invoiceNumber} · issued{' '}
            {formatDate(invoice.issueDate)}
          </span>
        </span>

        <span className={`badge badge--${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>
        <span className="queue__amount">{formatGBP(subtotal(invoice.lines))}</span>

        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Review'}
        </button>
      </div>

      {open && (
        <div className="queue__body">
          {invoice.decisionNote && (
            <Notice tone="warning" title="Changes requested. ">
              {invoice.decisionNote}
            </Notice>
          )}

          <table className="queue__lines">
            <tbody>
              {invoice.lines.map((line) => {
                const item = rateItem(line.rateItemId);
                const asana = line.asanaLinks.map((l) => l.trim()).filter(Boolean);
                const pages = line.pageLinks.map((l) => l.trim()).filter(Boolean);

                return (
                  <tr key={line.key}>
                    <td>
                      <strong>{item?.short ?? line.rateItemId}</strong>
                      <div className="queue__links">
                        {asana.map((url, i) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            Asana {asana.length > 1 ? i + 1 : ''}
                          </a>
                        ))}
                        {pages.map((url, i) => (
                          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                            Page {pages.length > 1 ? i + 1 : ''}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {line.qty} × {formatGBP(line.unitPrice)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {formatGBP(lineAmount(line))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {askingForChanges ? (
            <div>
              <label
                className="small"
                style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}
                htmlFor={`note-${invoice.id}`}
              >
                What needs changing?
              </label>
              <textarea
                id={`note-${invoice.id}`}
                value={note}
                rows={3}
                placeholder="The freelancer will see this."
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={!note.trim() || busy}
                  onClick={() => void requestChanges()}
                >
                  Send back with this note
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => setAskingForChanges(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="actions">
              {actions.map((action) =>
                action.to === 'changes_requested' ? (
                  <button
                    key={action.to}
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => setAskingForChanges(true)}
                  >
                    {action.label}
                  </button>
                ) : (
                  <button
                    key={action.to}
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void onDecide(invoice, action.to)}
                  >
                    {action.label}
                  </button>
                ),
              )}
              {actions.length === 0 && (
                <span className="small muted">Nothing for you to do on this one.</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
