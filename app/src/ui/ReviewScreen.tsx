import { useState } from 'react';
import { NOTICE_WORKING_DAYS } from '../domain/company';
import { deadlineStatus, formatGBP, invoiceFileBase, monthLabel, subtotal } from '../domain/invoice';
import type { Invoice } from '../domain/types';
import { validateInvoice } from '../domain/validation';
import { downloadBlob, loadTemplate } from '../export/download';
import { buildXlsx } from '../export/xlsx';
import { Card, IssueSummary, Notice } from './components';
import { InvoicePreview } from './InvoicePreview';

interface Props {
  invoice: Invoice;
  onBack: () => void;
  onRecord: (invoice: Invoice) => void;
  /** Team mode: submit into the approval workflow. */
  onSubmit?: () => void;
  submitting?: boolean;
}

type Status = { tone: 'info' | 'error'; text: string } | null;

export function ReviewScreen({ invoice, onBack, onRecord, onSubmit, submitting }: Props) {
  const [busy, setBusy] = useState(false);
  const [busyPdf, setBusyPdf] = useState(false);
  const [status, setStatus] = useState<Status>(null);

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

  const downloadPdf = async () => {
    setBusyPdf(true);
    setStatus(null);
    try {
      // The PDF renderer is ~1MB, so it is only fetched when someone actually
      // asks for a PDF rather than on every page load.
      const { buildPdf } = await import('../export/pdf');
      const blob = await buildPdf(invoice);
      downloadBlob(blob, pdfName);
      onRecord(invoice);
      setStatus({ tone: 'info', text: `Saved ${pdfName}.` });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Could not build the PDF.',
      });
    } finally {
      setBusyPdf(false);
    }
  };

  return (
    <>
      <div className="screen-head no-print">
        <h1>Review &amp; submit</h1>
        <p>Check the invoice below, download a copy if needed, then submit it into the approval workflow.</p>
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
              {deadlineExplanation(deadline)} You can still submit it; your manager will see that it is late.
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
            <button
              type="button"
              className="btn btn--dark"
              onClick={downloadPdf}
              disabled={blocked || busyPdf}
            >
              {busyPdf && <span className="spinner" aria-hidden="true" />}
              {busyPdf ? 'Building…' : `Download ${pdfName}`}
            </button>
          </div>
          <p className="small muted" style={{ margin: '12px 0 0' }}>
            The spreadsheet follows the company template and the PDF is a readable copy. Asana and
            page links stay clickable in both.
          </p>
        </Card>

        {onSubmit && (
          <Card
            title="2. Submit for approval"
            subtitle="Your line manager reviews it inside this portal"
          >
            <div className="actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={onSubmit}
                disabled={blocked || submitting}
              >
                {submitting && <span className="spinner" aria-hidden="true" />}
                {submitting ? 'Submitting…' : 'Submit for approval'}
              </button>
            </div>
            <p className="small muted" style={{ margin: '12px 0 0' }}>
              Once submitted the invoice is locked. Your manager can approve it or send it back
              with a note.
            </p>
          </Card>
        )}

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
