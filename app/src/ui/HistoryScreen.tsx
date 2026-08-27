import { formatDate, formatGBP, monthLabel, subtotal } from '../domain/invoice';
import type { Invoice } from '../domain/types';
import { Card, Notice } from './components';

interface Props {
  invoices: Invoice[];
  onReopen: (invoice: Invoice) => void;
  onDelete: (id: string) => void;
}

export function HistoryScreen({ invoices, onReopen, onDelete }: Props) {
  return (
    <>
      <div className="screen-head">
        <h1>Past invoices</h1>
        <p>
          Every invoice you have generated on this computer. Reopen one to use it as the starting
          point for a new month.
        </p>
      </div>

      <Notice tone="info" title="Stored on this device only. ">
        Clearing your browser data will clear this list. Keep the downloaded files as your record.
      </Notice>

      <Card title={`History${invoices.length ? ` (${invoices.length})` : ''}`}>
        {invoices.length === 0 ? (
          <p className="empty">Nothing here yet. Generated invoices will be listed here.</p>
        ) : (
          <table className="history">
            <thead>
              <tr>
                <th>#</th>
                <th>Period</th>
                <th>Issued</th>
                <th>Lines</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="history__num">{invoice.invoiceNumber}</td>
                  <td>{monthLabel(invoice.periodMonth)}</td>
                  <td>{formatDate(invoice.issueDate)}</td>
                  <td>{invoice.lines.length}</td>
                  <td className="history__amount">{formatGBP(subtotal(invoice.lines))}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => onReopen(invoice)}
                    >
                      Reopen
                    </button>{' '}
                    <button
                      type="button"
                      className="btn btn--danger btn--sm"
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remove invoice #${invoice.invoiceNumber} from this list? The downloaded files are not affected.`,
                          )
                        ) {
                          onDelete(invoice.id);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
