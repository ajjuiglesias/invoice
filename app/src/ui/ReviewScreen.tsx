import { useState } from 'react';
import { NOTICE_WORKING_DAYS, RECIPIENTS } from '../domain/company';
import { deadlineStatus, formatGBP, invoiceFileBase, monthLabel, subtotal } from '../domain/invoice';
import type { Invoice } from '../domain/types';
import { validateInvoice } from '../domain/validation';
import { downloadBlob, loadTemplate } from '../export/download';
import { buildXlsx } from '../export/xlsx';
import { buildMessage, GmailComposeAdapter, MailtoAdapter, messageAsText } from '../mail/gmail';
import { Card, IssueSummary, Notice } from './components';
import { InvoicePreview } from './InvoicePreview';

interface Props {
  invoice: Invoice;
  onBack: () => void;
  onRecord: (invoice: Invoice) => void;
}

type Status = { tone: 'info' | 'error'; text: string } | null;

export function ReviewScreen({ invoice, onBack, onRecord }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [downloaded, setDownloaded] = useState(false);

  const issues = validateInvoice(invoice);
  const errors = issues.filter((i) => i.severity === 'error');
  const blocked = errors.length > 0;
  const total = subtotal(invoice.lines);
  const deadline = deadlineStatus(invoice.periodMonth);

  const fileBase = invoiceFileBase(invoice);
  const xlsxName = `${fileBase}.xlsx`;
  const pdfName = `${fileBase}.pdf`;

  const downloadXlsx = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const template = await loadTemplate();
      const { blob, subtotal: written } = await buildXlsx(template, invoice);

      if (Math.abs(written - total) > 0.005) {
        throw new Error(
          `The spreadsheet total (${formatGBP(written)}) does not match the invoice total (${formatGBP(total)}). Nothing was downloaded.`,
        );
      }

      downloadBlob(blob, xlsxName);
      setDownloaded(true);
      onRecord(invoice);
      setStatus({ tone: 'info', text: `Saved ${xlsxName}. This is the file accounts needs.` });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not build the spreadsheet.',
      });
    } finally {
      setBusy(false);
    }
  };

  const printPdf = () => {
    onRecord(invoice);
    setDownloaded(true);
    // The print stylesheet hides everything except the invoice sheet.
    window.print();
  };

  const message = buildMessage(invoice, [xlsxName, pdfName]);

  const openGmail = () => {
    new GmailComposeAdapter().deliver(message);
    setStatus({
      tone: 'info',
      text: 'Gmail is open with the email filled in. Attach the two downloaded files, then send.',
    });
  };

  const openMailClient = () => {
    new MailtoAdapter().deliver(message);
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(messageAsText(message));
      setStatus({ tone: 'info', text: 'Email copied to your clipboard.' });
    } catch {
      setStatus({ tone: 'error', text: 'Could not copy — select the text below and copy manually.' });
    }
  };

  return (
    <>
      <div className="screen-head no-print">
        <h1>Review &amp; send</h1>
        <p>
          Check the invoice below, download both files, then send them to {RECIPIENTS.to} with{' '}
          {RECIPIENTS.cc} copied in.
        </p>
      </div>

      <div className="no-print">
        <IssueSummary issues={issues} />

        {status && (
          <Notice tone={status.tone === 'error' ? 'error' : 'info'}>{status.text}</Notice>
        )}
      </div>

      <div style={{ marginBottom: 20 }}>
        <InvoicePreview invoice={invoice} />
      </div>

      <div className="no-print">
        <Card
          title="1. Download the files"
          subtitle="The spreadsheet is the company's own template, filled in"
          aside={
            <span
              className={`deadline deadline--${deadline.status}`}
              title={deadlineExplanation(deadline)}
            >
              {deadline.status === 'late'
                ? 'Past the deadline'
                : deadline.status === 'due-soon'
                  ? `${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? '' : 's'} left`
                  : `Due ${deadline.deadline.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
            </span>
          }
        >
          {blocked && (
            <Notice
              tone="error"
              title={`Fix ${errors.length} thing${errors.length === 1 ? '' : 's'} before you can download. `}
            >
              <ul>
                {errors.slice(0, 5).map((issue, i) => (
                  <li key={i}>{issue.message}</li>
                ))}
                {errors.length > 5 && <li>…and {errors.length - 5} more.</li>}
              </ul>
              <p style={{ margin: '8px 0 0' }}>
                <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
                  Go back and fix them
                </button>
              </p>
            </Notice>
          )}

          {deadline.status === 'late' && !blocked && (
            <Notice tone="warning" title="This is past the submission window. ">
              {deadlineExplanation(deadline)} You can still download and send it — just flag it to
              your line manager.
            </Notice>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={downloadXlsx}
              disabled={blocked || busy}
            >
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'Building…' : `Download ${xlsxName}`}
            </button>
            <button type="button" className="btn btn--dark" onClick={printPdf} disabled={blocked}>
              Save the branded PDF
            </button>
          </div>
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            The PDF button opens your browser's print dialog — choose{' '}
            <strong>Save as PDF</strong> as the destination, and name it{' '}
            <strong>{pdfName}</strong>.
          </p>
        </Card>

        <Card
          title="2. Send it"
          subtitle={`To ${RECIPIENTS.to}, copying ${RECIPIENTS.cc}`}
        >
          {!downloaded && (
            <Notice tone="warning">
              Download the files first — the email opens ready to send, but you still attach the
              files yourself.
            </Notice>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={openGmail}
              disabled={blocked}
            >
              Open in Gmail
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={openMailClient}
              disabled={blocked}
            >
              Open in my mail app
            </button>
            <button type="button" className="btn btn--ghost" onClick={copyEmail}>
              Copy the email
            </button>
          </div>

          <details style={{ marginTop: 16 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>
              Preview the email
            </summary>
            <pre
              className="small"
              style={{
                whiteSpace: 'pre-wrap',
                background: '#fafbfb',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: 14,
                marginTop: 10,
                fontFamily: 'inherit',
              }}
            >
              {messageAsText(message)}
            </pre>
          </details>
        </Card>

        <div className="actions actions--split">
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            ← Edit the invoice
          </button>
          <span className="small muted">
            {monthLabel(invoice.periodMonth)} · Invoice #{invoice.invoiceNumber} ·{' '}
            <strong>{formatGBP(total)}</strong>
          </span>
        </div>
      </div>
    </>
  );
}

/** Plain-English reason the deadline pill is showing what it is showing. */
function deadlineExplanation(deadline: ReturnType<typeof deadlineStatus>): string {
  const when = deadline.deadline.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const rule = `The company asks for invoices ${NOTICE_WORKING_DAYS} working days before the last day of the month, which was ${when}.`;

  if (deadline.status === 'late') {
    const late = Math.abs(deadline.daysRemaining);
    return `${rule} That was ${late} day${late === 1 ? '' : 's'} ago.`;
  }
  return rule;
}
