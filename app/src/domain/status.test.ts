import { describe, expect, it } from 'vitest';
import {
  allowedTransitions,
  canTransition,
  isEditable,
  needsDecision,
  STATUSES,
  STATUS_LABEL,
  STATUS_TONE,
  TRANSITIONS,
  type InvoiceStatus,
  type Role,
} from './status';

const ROLES: Role[] = ['freelancer', 'manager', 'accounts', 'admin'];

describe('status metadata', () => {
  it('labels and tones every status', () => {
    for (const status of STATUSES) {
      expect(STATUS_LABEL[status]).toBeTruthy();
      expect(STATUS_TONE[status]).toBeTruthy();
    }
  });

  it('only allows editing before submission', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('changes_requested')).toBe(true);
    expect(isEditable('submitted')).toBe(false);
    expect(isEditable('approved')).toBe(false);
    expect(isEditable('paid')).toBe(false);
  });

  it('only queues submitted invoices for a decision', () => {
    expect(needsDecision('submitted')).toBe(true);
    for (const status of STATUSES.filter((s) => s !== 'submitted')) {
      expect(needsDecision(status)).toBe(false);
    }
  });

  it('never declares a transition to a status that does not exist', () => {
    for (const t of TRANSITIONS) {
      expect(STATUSES).toContain(t.from);
      expect(STATUSES).toContain(t.to);
    }
  });
});

describe('who may do what', () => {
  it('lets a freelancer submit their own draft', () => {
    expect(canTransition('draft', 'submitted', 'freelancer', true)).toBe(true);
  });

  it('does not let a freelancer submit somebody else’s draft', () => {
    expect(canTransition('draft', 'submitted', 'freelancer', false)).toBe(false);
  });

  it('does not let a freelancer approve, even their own', () => {
    expect(canTransition('submitted', 'approved', 'freelancer', true)).toBe(false);
  });

  it('lets a manager approve or send back', () => {
    expect(canTransition('submitted', 'approved', 'manager', false)).toBe(true);
    expect(canTransition('submitted', 'changes_requested', 'manager', false)).toBe(true);
  });

  it('does not let a manager mark an invoice paid', () => {
    expect(canTransition('approved', 'sent', 'manager', false)).toBe(false);
    expect(canTransition('sent', 'paid', 'manager', false)).toBe(false);
  });

  it('lets accounts progress an approved invoice but not approve one', () => {
    expect(canTransition('approved', 'sent', 'accounts', false)).toBe(true);
    expect(canTransition('sent', 'paid', 'accounts', false)).toBe(true);
    expect(canTransition('submitted', 'approved', 'accounts', false)).toBe(false);
  });

  it('lets a freelancer resubmit after changes are requested', () => {
    expect(canTransition('changes_requested', 'submitted', 'freelancer', true)).toBe(true);
  });

  it('offers nothing once an invoice is paid', () => {
    for (const role of ROLES) {
      expect(allowedTransitions('paid', role, true)).toHaveLength(0);
    }
  });

  it('never allows a status to move to itself', () => {
    for (const status of STATUSES) {
      for (const role of ROLES) {
        expect(allowedTransitions(status, role, true).some((t) => t.to === status)).toBe(false);
      }
    }
  });

  it('never lets anything move backwards out of approved except by accounts progressing it', () => {
    const fromApproved = ROLES.flatMap((role) => allowedTransitions('approved', role, true)).map(
      (t) => t.to,
    );
    expect(new Set(fromApproved)).toEqual(new Set(['sent']));
  });
});

describe('admin', () => {
  it('can do everything a manager and accounts can', () => {
    const managerMoves: Array<[InvoiceStatus, InvoiceStatus]> = [
      ['submitted', 'approved'],
      ['submitted', 'changes_requested'],
      ['approved', 'sent'],
      ['sent', 'paid'],
    ];
    for (const [from, to] of managerMoves) {
      expect(canTransition(from, to, 'admin', false)).toBe(true);
    }
  });
});
