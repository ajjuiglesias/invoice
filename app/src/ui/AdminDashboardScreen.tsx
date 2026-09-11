import { formatGBP, subtotal } from '../domain/invoice';
import type { Invoice } from '../domain/types';
import type { AccessAuditEntry, RateCardSummary, TeamMember, UserInvite } from '../store/adapter';
import type { AdminSection } from './AdminLayout';

interface Props {
  invoices: Invoice[];
  members: TeamMember[];
  invites: UserInvite[];
  accessAudit: AccessAuditEntry[];
  rateCards: RateCardSummary[];
  onNavigate: (section: AdminSection) => void;
}

export function AdminDashboardScreen({ invoices, members, invites, accessAudit, rateCards, onNavigate }: Props) {
  const pending = invoices.filter((invoice) => invoice.status === 'submitted');
  const approved = invoices.filter((invoice) => invoice.status === 'approved');
  const unpaid = invoices.filter((invoice) => invoice.status === 'sent');
  const paid = invoices.filter((invoice) => invoice.status === 'paid');
  const activeMembers = members.filter((member) => member.active);
  const pendingInvites = invites.filter((invite) => !invite.acceptedAt);
  const total = (items: Invoice[]) => items.reduce((sum, invoice) => sum + subtotal(invoice.lines), 0);
  const recent = [...invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div><span className="eyebrow eyebrow--light">Management overview</span><h1>Invoice operations</h1><p>Approvals, payments, people, and pricing in one place.</p></div>
        <button type="button" className="dashboard-hero__action" onClick={() => onNavigate('approvals')}>Review {pending.length} pending</button>
      </div>

      <div className="dashboard-kpis">
        <Kpi label="Awaiting approval" value={String(pending.length)} detail={formatGBP(total(pending))} tone="amber" onClick={() => onNavigate('approvals')} />
        <Kpi label="Approved" value={String(approved.length)} detail={formatGBP(total(approved))} tone="teal" onClick={() => onNavigate('accounts')} />
        <Kpi label="Awaiting payment" value={String(unpaid.length)} detail={formatGBP(total(unpaid))} tone="blue" onClick={() => onNavigate('accounts')} />
        <Kpi label="Paid" value={String(paid.length)} detail={formatGBP(total(paid))} tone="green" onClick={() => onNavigate('accounts')} />
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card dashboard-card--wide">
          <div className="dashboard-card__head"><div><h2>Recent invoices</h2><p>Latest activity across the team</p></div><button type="button" onClick={() => onNavigate('history')}>View history</button></div>
          {recent.length === 0 ? <p className="empty">No invoices have been submitted yet.</p> : <div className="dashboard-invoice-list">
            {recent.map((invoice) => <div className="dashboard-invoice" key={invoice.id}><div><strong>Invoice #{invoice.invoiceNumber}</strong><span>{invoice.profile.fullName || invoice.profile.email}</span></div><span className={`status status--${invoice.status}`}>{(invoice.status ?? 'draft').replace('_', ' ')}</span><strong>{formatGBP(subtotal(invoice.lines))}</strong></div>)}
          </div>}
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card__head"><div><h2>Team access</h2><p>Current portal membership</p></div><button type="button" onClick={() => onNavigate('admin-team')}>Manage</button></div>
          <div className="dashboard-stat-row"><span>Active members</span><strong>{activeMembers.length}</strong></div>
          <div className="dashboard-stat-row"><span>Pending invitations</span><strong>{pendingInvites.length}</strong></div>
          <div className="dashboard-stat-row"><span>Administrators</span><strong>{members.filter((m) => m.active && m.role === 'admin').length}</strong></div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card__head"><div><h2>Rate card</h2><p>Pricing configuration</p></div><button type="button" onClick={() => onNavigate('admin-rates')}>Manage</button></div>
          <div className="dashboard-rate-version">{rateCards[0]?.version ?? 'Built-in'}</div>
          <p className="dashboard-card__note">{rateCards.length} published version{rateCards.length === 1 ? '' : 's'} · {rateCards[0]?.itemCount ?? 29} task types</p>
        </section>

        <section className="dashboard-card dashboard-card--wide">
          <div className="dashboard-card__head"><div><h2>Recent access changes</h2><p>Latest administrative actions</p></div><button type="button" onClick={() => onNavigate('admin-team')}>Full audit</button></div>
          {accessAudit.length === 0 ? <p className="empty">No access changes recorded.</p> : <div className="dashboard-audit-list">{accessAudit.slice(0, 5).map((entry) => <div key={entry.id}><span className="dashboard-audit-dot" /><div><strong>{entry.action.split('_').join(' ')}</strong><span>{entry.targetEmail}</span></div><time>{new Date(entry.createdAt).toLocaleDateString('en-GB')}</time></div>)}</div>}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, detail, tone, onClick }: { label: string; value: string; detail: string; tone: string; onClick: () => void }) {
  return <button type="button" className={`dashboard-kpi dashboard-kpi--${tone}`} onClick={onClick}><span>{label}</span><strong>{value}</strong><small>{detail}</small></button>;
}
