import { useState, type ReactNode } from 'react';
import { COMPANY } from '../domain/company';
import type { Role } from '../domain/status';
import type { CurrentUser } from '../store/adapter';

export type AdminSection = 'approvals' | 'accounts' | 'admin-rates' | 'admin-team' | 'history' | 'build';

interface AdminLayoutProps {
  currentSection: AdminSection;
  onNavigate: (section: AdminSection) => void;
  user: CurrentUser | null;
  onSignOut: () => void;
  pendingApprovalsCount: number;
  activeRateCardVersion: string;
  onNewInvoice: () => void;
  busy?: boolean;
  onRefresh?: () => void;
  children: ReactNode;
}

export function AdminLayout({
  currentSection,
  onNavigate,
  user,
  onSignOut,
  pendingApprovalsCount,
  activeRateCardVersion,
  onNewInvoice,
  busy = false,
  onRefresh,
  children,
}: AdminLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role: Role = user?.role ?? 'freelancer';
  const isAdmin = role === 'admin';
  const canReview = role === 'manager' || role === 'accounts' || role === 'admin';
  const seesAccounts = role === 'accounts' || role === 'admin';

  const userInitials = (user?.profile.fullName || user?.email || 'U')
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const getSectionTitle = () => {
    switch (currentSection) {
      case 'approvals':
        return 'Invoice Approvals';
      case 'accounts':
        return 'Accounts & Financials';
      case 'admin-rates':
        return 'Rate Card & Pricing Matrix';
      case 'admin-team':
        return 'Team Members & Permissions';
      case 'history':
        return 'Invoice History';
      case 'build':
        return 'Invoice Builder';
      default:
        return 'Admin Portal';
    }
  };

  return (
    <div className={`admin-shell ${sidebarCollapsed ? 'admin-shell--collapsed' : ''}`}>
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div
          className="admin-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`admin-sidebar ${mobileMenuOpen ? 'admin-sidebar--open' : ''}`}>
        {/* Brand header */}
        <div className="admin-sidebar__header">
          <img src="logo-dark.png" alt={COMPANY.name} className="admin-sidebar__logo" />
          <div className="admin-sidebar__brand-text">
            <span className="admin-sidebar__brand-name">JCEM Portal</span>
            <span className="admin-sidebar__badge">Management</span>
          </div>
        </div>

        {/* User Card */}
        {user && (
          <div className="admin-user-card">
            <div className="admin-user-card__avatar">{userInitials}</div>
            <div className="admin-user-card__info">
              <span className="admin-user-card__name" title={user.profile.fullName || user.email}>
                {user.profile.fullName || user.email.split('@')[0]}
              </span>
              <span className={`admin-role-pill admin-role-pill--${user.role}`}>{user.role}</span>
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <nav className="admin-nav">
          <div className="admin-nav__group">
            <span className="admin-nav__heading">MANAGEMENT</span>

            {canReview && (
              <button
                type="button"
                className={`admin-nav__item ${currentSection === 'approvals' ? 'admin-nav__item--active' : ''}`}
                onClick={() => {
                  onNavigate('approvals');
                  setMobileMenuOpen(false);
                }}
              >
                <svg className="admin-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <span className="admin-nav__label">Approvals</span>
                {pendingApprovalsCount > 0 ? (
                  <span className="admin-nav__counter admin-nav__counter--active">
                    {pendingApprovalsCount}
                  </span>
                ) : (
                  <span className="admin-nav__counter">0</span>
                )}
              </button>
            )}

            {seesAccounts && (
              <button
                type="button"
                className={`admin-nav__item ${currentSection === 'accounts' ? 'admin-nav__item--active' : ''}`}
                onClick={() => {
                  onNavigate('accounts');
                  setMobileMenuOpen(false);
                }}
              >
                <svg className="admin-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                <span className="admin-nav__label">Accounts &amp; Totals</span>
              </button>
            )}
          </div>

          {isAdmin && (
            <div className="admin-nav__group">
              <span className="admin-nav__heading">ADMINISTRATION</span>

              <button
                type="button"
                className={`admin-nav__item ${currentSection === 'admin-rates' ? 'admin-nav__item--active' : ''}`}
                onClick={() => {
                  onNavigate('admin-rates');
                  setMobileMenuOpen(false);
                }}
              >
                <svg className="admin-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <span className="admin-nav__label">Rate Card &amp; Prices</span>
                <span className="admin-nav__subpill">{activeRateCardVersion}</span>
              </button>

              <button
                type="button"
                className={`admin-nav__item ${currentSection === 'admin-team' ? 'admin-nav__item--active' : ''}`}
                onClick={() => {
                  onNavigate('admin-team');
                  setMobileMenuOpen(false);
                }}
              >
                <svg className="admin-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="admin-nav__label">Team Members</span>
              </button>
            </div>
          )}

          <div className="admin-nav__group">
            <span className="admin-nav__heading">INVOICE WORKSPACE</span>

            <button
              type="button"
              className={`admin-nav__item ${currentSection === 'history' ? 'admin-nav__item--active' : ''}`}
              onClick={() => {
                onNavigate('history');
                setMobileMenuOpen(false);
              }}
            >
              <svg className="admin-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="admin-nav__label">Past Invoices</span>
            </button>

            <button
              type="button"
              className={`admin-nav__item ${currentSection === 'build' ? 'admin-nav__item--active' : ''}`}
              onClick={() => {
                onNavigate('build');
                setMobileMenuOpen(false);
              }}
            >
              <svg className="admin-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
              <span className="admin-nav__label">New Invoice</span>
            </button>
          </div>
        </nav>

        {/* Sidebar Footer */}
        <div className="admin-sidebar__footer">
          <div className="admin-sidebar__status">
            <span className="admin-status-dot" />
            <span>Team Mode Live</span>
          </div>
          <button
            type="button"
            className="admin-sidebar__signout"
            onClick={onSignOut}
            title="Sign out of your account"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="admin-content-wrap">
        {/* Top Header */}
        <header className="admin-topbar">
          <div className="admin-topbar__left">
            <button
              type="button"
              className="admin-topbar__toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label="Toggle sidebar"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}>
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <button
              type="button"
              className="admin-topbar__mobile-btn"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open mobile menu"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 22, height: 22 }}>
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div className="admin-breadcrumbs">
              <span className="admin-breadcrumbs__root">JCEM Portal</span>
              <span className="admin-breadcrumbs__sep">/</span>
              <span className="admin-breadcrumbs__current">{getSectionTitle()}</span>
            </div>
          </div>

          <div className="admin-topbar__right">
            {onRefresh && (
              <button
                type="button"
                className="admin-btn admin-btn--icon"
                onClick={onRefresh}
                disabled={busy}
                title="Refresh dashboard data"
              >
                <svg
                  className={busy ? 'admin-spin' : ''}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{ width: 16, height: 16 }}
                >
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            )}

            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={onNewInvoice}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 16, height: 16 }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New Invoice</span>
            </button>
          </div>
        </header>

        {/* Dynamic Body Content */}
        <main className="admin-main">
          {children}
        </main>
      </div>
    </div>
  );
}
