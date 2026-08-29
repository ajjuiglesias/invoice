/**
 * Invoice lifecycle.
 *
 * The database enforces these transitions in a trigger — this module mirrors
 * them so the UI can show the right buttons. The database is the authority;
 * if the two ever disagree, the database wins and the UI is wrong.
 */

export const STATUSES = [
  'draft',
  'submitted',
  'changes_requested',
  'approved',
  'sent',
  'paid',
] as const;

export type InvoiceStatus = (typeof STATUSES)[number];

export type Role = 'freelancer' | 'manager' | 'accounts' | 'admin';

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  sent: 'Sent to accounts',
  paid: 'Paid',
};

/** Maps onto the .badge--* classes in the stylesheet. */
export const STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'pending' | 'good' | 'warn'> = {
  draft: 'neutral',
  submitted: 'pending',
  changes_requested: 'warn',
  approved: 'good',
  sent: 'good',
  paid: 'good',
};

interface Transition {
  from: InvoiceStatus;
  to: InvoiceStatus;
  roles: Role[];
  /** Only the invoice's own freelancer may make this move. */
  ownerOnly?: boolean;
  label: string;
}

export const TRANSITIONS: Transition[] = [
  { from: 'draft', to: 'submitted', roles: ['freelancer', 'admin'], ownerOnly: true, label: 'Submit for approval' },
  {
    from: 'changes_requested',
    to: 'submitted',
    roles: ['freelancer', 'admin'],
    ownerOnly: true,
    label: 'Resubmit',
  },
  { from: 'submitted', to: 'approved', roles: ['manager', 'admin'], label: 'Approve' },
  {
    from: 'submitted',
    to: 'changes_requested',
    roles: ['manager', 'admin'],
    label: 'Request changes',
  },
  { from: 'approved', to: 'sent', roles: ['accounts', 'admin'], label: 'Mark as sent' },
  { from: 'sent', to: 'paid', roles: ['accounts', 'admin'], label: 'Mark as paid' },
];

export function allowedTransitions(
  status: InvoiceStatus,
  role: Role,
  isOwner: boolean,
): Transition[] {
  return TRANSITIONS.filter(
    (t) => t.from === status && t.roles.includes(role) && (!t.ownerOnly || isOwner),
  );
}

export function canTransition(
  from: InvoiceStatus,
  to: InvoiceStatus,
  role: Role,
  isOwner: boolean,
): boolean {
  return allowedTransitions(from, role, isOwner).some((t) => t.to === to);
}

/** A freelancer may still change the contents at these points. */
export function isEditable(status: InvoiceStatus): boolean {
  return status === 'draft' || status === 'changes_requested';
}

/** What a manager needs to look at. */
export function needsDecision(status: InvoiceStatus): boolean {
  return status === 'submitted';
}
