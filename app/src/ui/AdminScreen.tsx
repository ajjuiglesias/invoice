import { useEffect, useMemo, useState } from 'react';
import { formatGBP } from '../domain/invoice';
import { activeRateCard, activeRateCardVersion, GROUPS, type RateItem } from '../domain/rate-card';
import type { Role } from '../domain/status';
import type { TeamMember } from '../store/adapter';
import { Notice } from './components';

interface Props {
  members: TeamMember[];
  busy: boolean;
  onPublishRateCard: (version: string, items: RateItem[]) => Promise<void>;
  onSetRole: (memberId: string, role: Role) => Promise<void>;
  onRefresh: () => void;
  initialTab?: 'rates' | 'team';
  onTabChange?: (tab: 'rates' | 'team') => void;
}

const ROLES: Role[] = ['freelancer', 'manager', 'accounts', 'admin'];

export function AdminScreen({
  members,
  busy,
  onPublishRateCard,
  onSetRole,
  onRefresh,
  initialTab = 'rates',
  onTabChange,
}: Props) {
  const [activeTab, setActiveTab] = useState<'rates' | 'team'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Rate card state
  const current = useMemo(() => activeRateCard(), []);
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(current.map((i) => [i.id, i.price])),
  );
  const [version, setVersion] = useState(() => suggestVersion(activeRateCardVersion()));
  const [rateSearch, setRateSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [status, setStatus] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  // Team members state
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('All');

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
        text: `Published version ${version.trim()} successfully! New invoices will use these rates.`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not publish the rate card.',
      });
    }
  };

  // Filtered rates
  const filteredRates = useMemo(() => {
    const q = rateSearch.trim().toLowerCase();
    return current.filter((item) => {
      const matchesGroup = selectedGroup === 'All' || item.group === selectedGroup;
      const matchesQuery =
        !q ||
        item.short.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        String(item.row).includes(q);
      return matchesGroup && matchesQuery;
    });
  }, [current, rateSearch, selectedGroup]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return members.filter((m) => {
      const matchesRole = selectedRoleFilter === 'All' || m.role === selectedRoleFilter;
      const matchesQuery =
        !q ||
        m.fullName.toLowerCase().includes(q) ||
        m.businessName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q);
      return matchesRole && matchesQuery;
    });
  }, [members, memberSearch, selectedRoleFilter]);

  // Member stats
  const memberStats = useMemo(() => {
    return {
      total: members.length,
      freelancers: members.filter((m) => m.role === 'freelancer').length,
      managers: members.filter((m) => m.role === 'manager').length,
      accounts: members.filter((m) => m.role === 'accounts').length,
      admins: members.filter((m) => m.role === 'admin').length,
    };
  }, [members]);

  return (
    <div className="admin-page">
      {/* Top Banner Notice */}
      {status && (
        <div style={{ marginBottom: 16 }}>
          <Notice tone={status.tone === 'error' ? 'error' : 'info'}>{status.text}</Notice>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${activeTab === 'rates' ? 'admin-tab--active' : ''}`}
          onClick={() => {
            setActiveTab('rates');
            onTabChange?.('rates');
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span>Rate Card &amp; Pricing</span>
          {changed.length > 0 && (
            <span className="admin-tab__badge admin-tab__badge--alert">{changed.length} edited</span>
          )}
        </button>

        <button
          type="button"
          className={`admin-tab ${activeTab === 'team' ? 'admin-tab--active' : ''}`}
          onClick={() => {
            setActiveTab('team');
            onTabChange?.('team');
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span>Team Members &amp; Roles</span>
          <span className="admin-tab__badge">{members.length}</span>
        </button>
      </div>

      {/* TAB 1: RATE CARD */}
      {activeTab === 'rates' && (
        <div className="admin-section">
          {/* Rate Card Metric Tiles */}
          <div className="admin-metrics">
            <div className="admin-metric-card">
              <span className="admin-metric-card__label">Active Version</span>
              <span className="admin-metric-card__value">{activeRateCardVersion()}</span>
              <span className="admin-metric-card__hint">Official rate card in effect</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-card__label">Categories &amp; Tasks</span>
              <span className="admin-metric-card__value">{current.length}</span>
              <span className="admin-metric-card__hint">Across {GROUPS.length} service groups</span>
            </div>
            <div className={`admin-metric-card ${changed.length > 0 ? 'admin-metric-card--highlight' : ''}`}>
              <span className="admin-metric-card__label">Unpublished Edits</span>
              <span className="admin-metric-card__value">{changed.length}</span>
              <span className="admin-metric-card__hint">
                {changed.length === 0 ? 'All prices published' : 'Changes ready to deploy'}
              </span>
            </div>
          </div>

          {/* Rate Card Filter Bar */}
          <div className="admin-panel-card">
            <div className="admin-filter-bar">
              <div className="admin-search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="admin-search-icon">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Filter task types or row number…"
                  value={rateSearch}
                  onChange={(e) => setRateSearch(e.target.value)}
                />
              </div>

              <div className="admin-filter-pills">
                <button
                  type="button"
                  className={`admin-filter-pill ${selectedGroup === 'All' ? 'admin-filter-pill--active' : ''}`}
                  onClick={() => setSelectedGroup('All')}
                >
                  All ({current.length})
                </button>
                {GROUPS.map((group) => {
                  const count = current.filter((r) => r.group === group).length;
                  return (
                    <button
                      type="button"
                      key={group}
                      className={`admin-filter-pill ${selectedGroup === group ? 'admin-filter-pill--active' : ''}`}
                      onClick={() => setSelectedGroup(group)}
                    >
                      {group} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sticky Change Publisher Banner */}
            {changed.length > 0 && (
              <div className="admin-change-banner">
                <div className="admin-change-banner__info">
                  <div className="admin-change-banner__count">
                    {changed.length} price change{changed.length === 1 ? '' : 's'} pending
                  </div>
                  <div className="admin-change-banner__inputs">
                    <label htmlFor="card-version" className="admin-change-banner__label">
                      New Version Name:
                    </label>
                    <input
                      id="card-version"
                      type="text"
                      className="admin-change-banner__version-input"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="e.g. 2026-09"
                    />
                  </div>
                </div>
                <div className="admin-change-banner__actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost"
                    onClick={() => setPrices(Object.fromEntries(current.map((i) => [i.id, i.price])))}
                  >
                    Discard Edits
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={busy || invalid || !version.trim()}
                    onClick={() => void publish()}
                  >
                    {busy && <span className="spinner" aria-hidden="true" />}
                    Publish New Version
                  </button>
                </div>
              </div>
            )}

            {/* Table */}
            <div className="admin-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 70 }}>Row</th>
                    <th>Task Description</th>
                    <th style={{ width: 160 }}>Category</th>
                    <th style={{ width: 140 }}>Rate (£)</th>
                    <th style={{ width: 120 }}>Previous</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRates.map((item) => {
                    const isChanged = prices[item.id] !== item.price;
                    const diff = prices[item.id] - item.price;

                    return (
                      <tr key={item.id} className={isChanged ? 'admin-table-row--highlight' : ''}>
                        <td>
                          <span className="admin-row-tag">#{item.row}</span>
                        </td>
                        <td>
                          <div className="admin-task-title">{item.short}</div>
                          {item.hint && <div className="admin-task-hint">{item.hint}</div>}
                          {item.customPrice && (
                            <span className="admin-badge admin-badge--info">Custom Price Allowed</span>
                          )}
                        </td>
                        <td>
                          <span className="admin-group-tag">{item.group}</span>
                        </td>
                        <td>
                          <div className="admin-price-input-wrap">
                            <span className="admin-price-prefix">£</span>
                            <input
                              type="number"
                              className={`admin-price-input ${!(prices[item.id] > 0) ? 'admin-price-input--invalid' : ''}`}
                              min={0.01}
                              step={0.01}
                              value={prices[item.id]}
                              aria-label={`Price for ${item.short}`}
                              onChange={(e) =>
                                setPrices({ ...prices, [item.id]: Number(e.target.value) })
                              }
                            />
                          </div>
                        </td>
                        <td>
                          {isChanged ? (
                            <span className={`admin-diff-pill ${diff > 0 ? 'admin-diff-pill--up' : 'admin-diff-pill--down'}`}>
                              {diff > 0 ? `+£${diff.toFixed(2)}` : `-£${Math.abs(diff).toFixed(2)}`}
                            </span>
                          ) : (
                            <span className="admin-table-faint">{formatGBP(item.price)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TEAM MEMBERS */}
      {activeTab === 'team' && (
        <div className="admin-section">
          {/* Team Metric Cards */}
          <div className="admin-metrics">
            <div className="admin-metric-card">
              <span className="admin-metric-card__label">Total Members</span>
              <span className="admin-metric-card__value">{memberStats.total}</span>
              <span className="admin-metric-card__hint">Signed in via Team Mode</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-card__label">Freelancers</span>
              <span className="admin-metric-card__value">{memberStats.freelancers}</span>
              <span className="admin-metric-card__hint">Can raise and submit invoices</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-card__label">Reviewers &amp; Approvers</span>
              <span className="admin-metric-card__value">{memberStats.managers + memberStats.admins}</span>
              <span className="admin-metric-card__hint">Can review &amp; sign off invoices</span>
            </div>
            <div className="admin-metric-card">
              <span className="admin-metric-card__label">Accounts &amp; Finance</span>
              <span className="admin-metric-card__value">{memberStats.accounts + memberStats.admins}</span>
              <span className="admin-metric-card__hint">Can access month-end financials</span>
            </div>
          </div>

          <div className="admin-panel-card">
            {/* Filter Bar */}
            <div className="admin-filter-bar">
              <div className="admin-search-wrap">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="admin-search-icon">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="admin-search-input"
                  placeholder="Filter members by name, business or email…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>

              <div className="admin-filter-pills">
                <button
                  type="button"
                  className={`admin-filter-pill ${selectedRoleFilter === 'All' ? 'admin-filter-pill--active' : ''}`}
                  onClick={() => setSelectedRoleFilter('All')}
                >
                  All ({members.length})
                </button>
                {ROLES.map((r) => {
                  const count = members.filter((m) => m.role === r).length;
                  return (
                    <button
                      type="button"
                      key={r}
                      className={`admin-filter-pill ${selectedRoleFilter === r ? 'admin-filter-pill--active' : ''}`}
                      onClick={() => setSelectedRoleFilter(r)}
                    >
                      {capitalize(r)} ({count})
                    </button>
                  );
                })}
              </div>

              {onRefresh && (
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  onClick={onRefresh}
                  disabled={busy}
                  style={{ marginLeft: 'auto' }}
                  title="Refresh team members"
                >
                  <svg
                    className={busy ? 'admin-spin' : ''}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ width: 14, height: 14 }}
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {/* Members Table */}
            <div className="admin-table-container">
              {filteredMembers.length === 0 ? (
                <p className="empty" style={{ padding: '32px' }}>
                  No team members match the search criteria.
                </p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Team Member</th>
                      <th>Email</th>
                      <th style={{ width: 140 }}>Status</th>
                      <th style={{ width: 180 }}>Role &amp; Permissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member) => {
                      const initials = (member.fullName || member.email || 'U')
                        .split(/\s+/)
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase();

                      return (
                        <tr key={member.id}>
                          <td>
                            <div className="admin-member-cell">
                              <div className="admin-member-avatar">{initials}</div>
                              <div>
                                <div className="admin-member-name">{member.fullName || '—'}</div>
                                {member.businessName && (
                                  <div className="admin-member-sub">{member.businessName}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="admin-table-faint">{member.email}</td>
                          <td>
                            <span className={`admin-status-badge ${member.active ? 'admin-status-badge--active' : 'admin-status-badge--inactive'}`}>
                              <span className="admin-status-dot" />
                              {member.active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="admin-role-select-wrap">
                              <select
                                className={`admin-role-select admin-role-select--${member.role}`}
                                value={member.role}
                                disabled={busy}
                                aria-label={`Role for ${member.fullName || member.email}`}
                                onChange={(e) => void onSetRole(member.id, e.target.value as Role)}
                              >
                                {ROLES.map((r) => (
                                  <option key={r} value={r}>
                                    {capitalize(r)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function suggestVersion(current: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(current);
  if (!match) return `${current}-revised`;
  const [, year, month] = match;
  const date = new Date(Number(year), Number(month), 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
