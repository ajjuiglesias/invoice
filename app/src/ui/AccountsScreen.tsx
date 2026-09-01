import { useMemo, useState } from 'react';
import { formatGBP, monthKey, monthLabel } from '../domain/invoice';
import {
  invoicesToCsv,
  notYetInvoiced,
  outstanding,
  summariseByFreelancer,
  summariseByMonth,
} from '../domain/reporting';
import { STATUS_LABEL, STATUS_TONE, type InvoiceStatus } from '../domain/status';
import type { Invoice } from '../domain/types';
import { downloadBlob } from '../export/download';
import type { TeamMember } from '../store/adapter';
import { Card, Notice } from './components';

interface Props {
  invoices: Invoice[];
  members: TeamMember[];
  busy: boolean;
  onRefresh: () => void;
}

/**
 * The month-end view: what is owed, what is stuck, and who has not invoiced
 * yet — the list accounts would otherwise assemble by hand.
 */
export function AccountsScreen({ invoices, members, busy, onRefresh }: Props) {
  const months = useMemo(() => summariseByMonth(invoices), [invoices]);
  const [selected, setSelected] = useState<string>(() => months[0]?.periodMonth ?? monthKey(new Date()));

  const flight = useMemo(() => outstanding(invoices), [invoices]);
  const people = useMemo(() => summariseByFreelancer(invoices, selected), [invoices, selected]);

  const freelancers = useMemo(
    () =>
      members
        .filter((m) => m.role === 'freelancer' && m.active)
        .map((m) => ({ id: m.id, name: m.fullName || m.businessName || m.email })),
    [members],
  );

  const missing = useMemo(
    () => notYetInvoiced(freelancers, invoices, selected),
    [freelancers, invoices, selected],
  );

  const exportCsv = () => {
    const scope = invoices.filter((i) => i.periodMonth === selected);
    const csv = invoicesToCsv(scope);
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `JCEM invoices ${selected}.csv`);
  };

  return (
    <>
      <div className="screen-head">
        <h1>Accounts</h1>
        <p>
          What is owed, what is waiting, and who has not invoiced yet. Figures come from the
          invoices you are allowed to see.
        </p>
      </div>

      <div className="actions actions--end" style={{ marginBottom: 14 }}>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onRefresh} disabled={busy}>
          Refresh
        </button>
      </div>

      <div className="tiles">
        <Tile
          label="Awaiting approval"
          tally={flight.awaitingApproval}
          hint="With the line manager"
        />
        <Tile
          label="Approved, not sent"
          tally={flight.approvedNotSent}
          hint="Ready to pay"
          emphasise
        />
        <Tile label="Sent, not paid" tally={flight.sentNotPaid} hint="Outstanding" />
      </div>

      <Card
        title="By month"
        subtitle="Select a month to break it down below"
      >
        {months.length === 0 ? (
          <p className="empty">No invoices yet.</p>
        ) : (
          <table className="history">
            <thead>
              <tr>
                <th>Month</th>
                <th>Invoices</th>
                <th>Breakdown</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.periodMonth}>
                  <td>
                    <strong>{month.label}</strong>
                  </td>
                  <td>{month.count}</td>
                  <td>
                    {Object.entries(month.byStatus).map(([status, tally]) => (
                      <span
                        key={status}
                        className={`badge badge--${STATUS_TONE[status as InvoiceStatus]}`}
                        style={{ marginRight: 6 }}
                      >
                        {STATUS_LABEL[status as InvoiceStatus]} {tally.count}
                      </span>
                    ))}
                  </td>
                  <td className="history__amount">{formatGBP(month.total)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      aria-pressed={selected === month.periodMonth}
                      onClick={() => setSelected(month.periodMonth)}
                    >
                      {selected === month.periodMonth ? 'Selected' : 'Select'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        title={`${monthLabel(selected)} — by freelancer`}
        aside={
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={exportCsv}
            disabled={people.length === 0}
          >
            Export CSV
          </button>
        }
      >
        {people.length === 0 ? (
          <p className="empty">Nothing invoiced for {monthLabel(selected)}.</p>
        ) : (
          <table className="history">
            <thead>
              <tr>
                <th>Freelancer</th>
                <th>Invoices</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.freelancerId}>
                  <td>
                    <strong>{person.name}</strong>
                  </td>
                  <td>{person.count}</td>
                  <td>
                    {person.statuses.map((status) => (
                      <span
                        key={status}
                        className={`badge badge--${STATUS_TONE[status]}`}
                        style={{ marginRight: 6 }}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    ))}
                  </td>
                  <td className="history__amount">{formatGBP(person.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`Not yet invoiced for ${monthLabel(selected)}`}>
        {freelancers.length === 0 ? (
          <Notice tone="info">
            Nobody is set up as a freelancer yet, so there is nobody to chase. Roles are set on the
            Admin screen.
          </Notice>
        ) : missing.length === 0 ? (
          <p className="empty">Everyone has submitted. Nothing to chase.</p>
        ) : (
          <ul className="rules">
            {missing.map((person) => (
              <li key={person.id}>{person.name}</li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function Tile({
  label,
  tally,
  hint,
  emphasise,
}: {
  label: string;
  tally: { count: number; total: number };
  hint: string;
  emphasise?: boolean;
}) {
  return (
    <div className={`tile${emphasise ? ' tile--emphasis' : ''}`}>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{formatGBP(tally.total)}</span>
      <span className="tile__hint">
        {tally.count} invoice{tally.count === 1 ? '' : 's'} · {hint}
      </span>
    </div>
  );
}
