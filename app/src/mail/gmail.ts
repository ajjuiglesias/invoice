import { COMPANY, RECIPIENTS } from '../domain/company';
import { formatDate, formatGBP, monthLabel, subtotal } from '../domain/invoice';
import type { Invoice } from '../domain/types';

export interface MailMessage {
  to: string;
  cc: string;
  subject: string;
  body: string;
}

/**
 * How the finished invoice gets delivered.
 *
 * Phase A opens a pre-filled compose window so the invoice is sent from the
 * freelancer's own address — no mail service, no API key, no sending domain.
 * Phase B can swap in a server-side sender that also attaches the files.
 */
export interface MailAdapter {
  /** 'compose' means the user still has to attach files and press send. */
  readonly kind: 'compose' | 'send';
  deliver(message: MailMessage): void;
}

export function buildMessage(invoice: Invoice, fileNames: string[]): MailMessage {
  const period = monthLabel(invoice.periodMonth);
  const total = formatGBP(subtotal(invoice.lines));
  const who = invoice.profile.businessName.trim() || invoice.profile.fullName.trim();

  const subject = `Invoice #${invoice.invoiceNumber} — ${period} — ${who}`;

  const body = [
    'Hi Kim,',
    '',
    `Please find attached my invoice for ${period}.`,
    '',
    `Invoice number: ${invoice.invoiceNumber}`,
    `Issue date: ${formatDate(invoice.issueDate)}`,
    `Total: ${total}`,
    '',
    'Every line has its Asana task link and the published page URL attached, and all',
    'the work listed has been signed off and published.',
    '',
    fileNames.length
      ? `Attached: ${fileNames.join(', ')}`
      : 'The invoice is attached.',
    '',
    'Please let me know if you need anything else before this goes to accounts.',
    '',
    'Many thanks,',
    invoice.profile.fullName.trim() || who,
    invoice.profile.email.trim(),
  ].join('\n');

  return { to: RECIPIENTS.to, cc: RECIPIENTS.cc, subject, body };
}

/** Opens Gmail's compose window with everything except the attachments filled in. */
export class GmailComposeAdapter implements MailAdapter {
  readonly kind = 'compose' as const;

  deliver(message: MailMessage): void {
    const url = new URL('https://mail.google.com/mail/');
    url.searchParams.set('view', 'cm');
    url.searchParams.set('fs', '1');
    url.searchParams.set('to', message.to);
    url.searchParams.set('cc', message.cc);
    url.searchParams.set('su', message.subject);
    url.searchParams.set('body', message.body);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }
}

/** Hands off to whatever mail client the machine has configured. */
export class MailtoAdapter implements MailAdapter {
  readonly kind = 'compose' as const;

  deliver(message: MailMessage): void {
    const params = new URLSearchParams({
      cc: message.cc,
      subject: message.subject,
      body: message.body,
    });
    window.location.href = `mailto:${encodeURIComponent(message.to)}?${params.toString()}`;
  }
}

/** Plain-text version of the covering note, for copying by hand. */
export function messageAsText(message: MailMessage): string {
  return [
    `To: ${message.to}`,
    `Cc: ${message.cc}`,
    `Subject: ${message.subject}`,
    '',
    message.body,
  ].join('\n');
}

export const COMPANY_NAME = COMPANY.name;
