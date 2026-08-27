import { COMPANY } from '../domain/company';
import { formatDate, formatGBP, lineAmount, monthLabel, sortLines, subtotal } from '../domain/invoice';
import { rateItem } from '../domain/rate-card';
import type { Invoice } from '../domain/types';

/**
 * The branded invoice, in JCEM colours and Open Sans.
 *
 * This is the element the print stylesheet turns into the PDF, so keep it
 * self-contained: no controls, nothing that only makes sense on screen.
 */
export function InvoicePreview({ invoice }: { invoice: Invoice }) {
  const lines = sortLines(invoice.lines);
  const total = subtotal(invoice.lines);
  const { profile } = invoice;

  return (
    <article className="sheet" id="invoice-sheet">
      <header className="sheet__top">
        <img className="sheet__logo" src="logo-dark.png" alt={COMPANY.name} />
        <div className="sheet__word">
          <h2>INVOICE</h2>
          <div className="sheet__meta">
            <div>
              Invoice # <b>{invoice.invoiceNumber}</b>
            </div>
            <div>
              Issue date <b>{formatDate(invoice.issueDate)}</b>
            </div>
            <div>
              Period <b>{monthLabel(invoice.periodMonth)}</b>
            </div>
          </div>
        </div>
      </header>

      <div className="sheet__parties">
        <div className="sheet__block">
          <h3>Billed to</h3>
          <p>
            <strong>{COMPANY.legalName}</strong>
            <br />
            {COMPANY.addressLines.map((l) => (
              <span key={l}>
                {l}
                <br />
              </span>
            ))}
          </p>
        </div>

        <div className="sheet__block">
          <h3>From</h3>
          <p>
            <strong>{profile.fullName}</strong>
            {profile.businessName && (
              <>
                <br />
                {profile.businessName}
              </>
            )}
            <br />
            {profile.postalAddress}
            {profile.country && (
              <>
                <br />
                {profile.country}
              </>
            )}
            <br />
            {profile.email}
          </p>
        </div>

        <div className="sheet__block">
          <h3>Payment details</h3>
          <p>
            <strong>{profile.bank.accountName}</strong>
            <br />
            {profile.bank.bankName}
            {profile.bank.sortCode && (
              <>
                <br />
                Sort code {profile.bank.sortCode}
              </>
            )}
            {profile.bank.accountNumber && (
              <>
                <br />
                Account {profile.bank.accountNumber}
              </>
            )}
            {profile.bank.iban && (
              <>
                <br />
                IBAN {profile.bank.iban}
              </>
            )}
            {profile.bank.bicSwift && (
              <>
                <br />
                BIC/SWIFT {profile.bank.bicSwift}
              </>
            )}
            {profile.bank.currency && (
              <>
                <br />
                Currency {profile.bank.currency}
              </>
            )}
          </p>
        </div>
      </div>

      <div className="sheet__items">
        <table className="itemtable">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Unit price</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const item = rateItem(line.rateItemId);
              const asana = line.asanaLinks.map((l) => l.trim()).filter(Boolean);
              const pages = line.pageLinks.map((l) => l.trim()).filter(Boolean);

              return (
                <tr key={line.key}>
                  <td>
                    <div className="itemtable__desc">{item?.short ?? line.rateItemId}</div>
                    <ul className="itemtable__links">
                      {asana.map((url) => (
                        <li key={url}>
                          <span className="itemtable__linklabel">Asana</span>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {shorten(url)}
                          </a>
                        </li>
                      ))}
                      {pages.map((url) => (
                        <li key={url}>
                          <span className="itemtable__linklabel">Page</span>
                          <a href={url} target="_blank" rel="noopener noreferrer">
                            {shorten(url)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="num">{line.qty}</td>
                  <td className="num">{formatGBP(line.unitPrice)}</td>
                  <td className="num">{formatGBP(lineAmount(line))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="sheet__total">
          <div className="sheet__total-inner">
            <span className="sheet__total-label">Total due</span>
            <span className="sheet__total-value">{formatGBP(total)}</span>
          </div>
        </div>
      </div>

      <footer className="sheet__foot">
        <strong>Terms.</strong> Fees are payable on the basis of approved and published content
        only. Every line above carries its Asana task link and the published page URL. This invoice
        covers work signed off by the line manager during {monthLabel(invoice.periodMonth)}.
      </footer>
    </article>
  );
}

/** URLs are long; show enough to recognise the page without wrapping forever. */
function shorten(url: string, max = 68): string {
  const trimmed = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
