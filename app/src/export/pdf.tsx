import {
  Document,
  Font,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from '@react-pdf/renderer';
import { BRAND, COMPANY } from '../domain/company';
import { formatDate, formatGBP, lineAmount, monthLabel, sortLines, subtotal } from '../domain/invoice';
import { rateItem } from '../domain/rate-card';
import type { Invoice } from '../domain/types';

/**
 * The branded invoice as a real, vector PDF.
 *
 * Text stays selectable and the Asana / page links stay clickable, which
 * matters because the whole point of the document is that Kim can click
 * through and check the work. Pagination is automatic, so a long invoice
 * spanning several pages keeps its table header.
 */

/**
 * Assets resolve against the deployed page in the browser. Outside a browser
 * (the Node smoke test) they resolve as paths relative to the app directory,
 * which is what @react-pdf expects there.
 */
const asset = (path: string) =>
  typeof document === 'undefined' ? `public/${path}` : new URL(path, document.baseURI).toString();

let fontsReady = false;

function ensureFonts(): void {
  if (fontsReady) return;

  Font.register({
    family: 'Open Sans',
    fonts: [
      { src: asset('fonts/OpenSans-Regular.ttf'), fontWeight: 400 },
      { src: asset('fonts/OpenSans-SemiBold.ttf'), fontWeight: 600 },
      { src: asset('fonts/OpenSans-Bold.ttf'), fontWeight: 700 },
    ],
  });

  // URLs are long and must never be broken across lines with a hyphen.
  Font.registerHyphenationCallback((word) => [word]);

  fontsReady = true;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Open Sans',
    fontSize: 9,
    color: '#23262b',
    paddingBottom: 54,
  },

  // ---- header band --------------------------------------------------------
  band: {
    backgroundColor: BRAND.charcoal,
    paddingVertical: 22,
    paddingHorizontal: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  logo: { height: 26 },
  bandRight: { alignItems: 'flex-end' },
  wordmark: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: 400,
    letterSpacing: 3,
  },
  metaRow: { flexDirection: 'row', marginTop: 5 },
  metaLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 8.5 },
  metaValue: { color: BRAND.teal, fontSize: 8.5, fontWeight: 600, marginLeft: 5 },

  // ---- parties ------------------------------------------------------------
  parties: {
    flexDirection: 'row',
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#dde3e5',
  },
  block: { flex: 1, paddingRight: 16 },
  blockHeading: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1,
    color: '#0c8f90',
    paddingBottom: 4,
    marginBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND.teal,
    alignSelf: 'flex-start',
  },
  blockStrong: { fontWeight: 600, marginBottom: 1 },
  // Address lines stack as sibling <Text> blocks, so keep the leading tight —
  // anything near 1.5 leaves them looking double-spaced.
  blockLine: { color: '#646c75', fontSize: 8.5, lineHeight: 1.25 },

  // ---- items --------------------------------------------------------------
  items: { paddingHorizontal: 32, paddingTop: 18 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: BRAND.charcoal,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: { color: '#ffffff', fontSize: 7.5, fontWeight: 700, letterSpacing: 0.8 },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#dde3e5',
  },
  rowAlt: { backgroundColor: '#fafbfb' },

  colDesc: { flex: 1, paddingRight: 10 },
  colQty: { width: 34, textAlign: 'right' },
  colUnit: { width: 62, textAlign: 'right' },
  colAmount: { width: 66, textAlign: 'right' },

  desc: { fontWeight: 600, fontSize: 9 },
  linkRow: { flexDirection: 'row', marginTop: 2.5 },
  linkLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: '#8d959d',
    width: 26,
    paddingTop: 0.5,
  },
  link: { fontSize: 7, color: '#0c8f90', textDecoration: 'none', flex: 1 },

  // ---- total --------------------------------------------------------------
  totalWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: BRAND.teal,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 4,
    width: 210,
  },
  totalLabel: { color: '#ffffff', fontSize: 8, fontWeight: 700, letterSpacing: 1 },
  totalValue: { color: '#ffffff', fontSize: 15, fontWeight: 700 },

  // ---- footer -------------------------------------------------------------
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    borderTopWidth: 1,
    borderTopColor: '#dde3e5',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  terms: { fontSize: 6.8, color: '#8d959d', lineHeight: 1.5, flex: 1, paddingRight: 14 },
  pageNo: { fontSize: 6.8, color: '#8d959d' },
});

export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const lines = sortLines(invoice.lines);
  const total = subtotal(invoice.lines);
  const { profile, bank } = { profile: invoice.profile, bank: invoice.profile.bank };

  return (
    <Document
      title={`Invoice ${invoice.invoiceNumber} — ${monthLabel(invoice.periodMonth)}`}
      author={profile.fullName}
      subject={`Freelancer invoice for ${monthLabel(invoice.periodMonth)}`}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.band} fixed>
          <Image style={styles.logo} src={asset('logo-dark.png')} />
          <View style={styles.bandRight}>
            <Text style={styles.wordmark}>INVOICE</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice #</Text>
              <Text style={styles.metaValue}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Issue date</Text>
              <Text style={styles.metaValue}>{formatDate(invoice.issueDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Period</Text>
              <Text style={styles.metaValue}>{monthLabel(invoice.periodMonth)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.parties}>
          <View style={styles.block}>
            <Text style={styles.blockHeading}>BILLED TO</Text>
            <Text style={styles.blockStrong}>{COMPANY.legalName}</Text>
            {COMPANY.addressLines.map((line) => (
              <Text key={line} style={styles.blockLine}>
                {line}
              </Text>
            ))}
          </View>

          <View style={styles.block}>
            <Text style={styles.blockHeading}>FROM</Text>
            <Text style={styles.blockStrong}>{profile.fullName}</Text>
            {profile.businessName ? (
              <Text style={styles.blockLine}>{profile.businessName}</Text>
            ) : null}
            <Text style={styles.blockLine}>{profile.postalAddress}</Text>
            {profile.country ? <Text style={styles.blockLine}>{profile.country}</Text> : null}
            <Text style={styles.blockLine}>{profile.email}</Text>
          </View>

          <View style={[styles.block, { paddingRight: 0 }]}>
            <Text style={styles.blockHeading}>PAYMENT DETAILS</Text>
            <Text style={styles.blockStrong}>{bank.accountName}</Text>
            <Text style={styles.blockLine}>{bank.bankName}</Text>
            {bank.sortCode ? (
              <Text style={styles.blockLine}>Sort code {bank.sortCode}</Text>
            ) : null}
            {bank.accountNumber ? (
              <Text style={styles.blockLine}>Account {bank.accountNumber}</Text>
            ) : null}
            {bank.iban ? <Text style={styles.blockLine}>IBAN {bank.iban}</Text> : null}
            {bank.bicSwift ? <Text style={styles.blockLine}>BIC/SWIFT {bank.bicSwift}</Text> : null}
            {bank.currency ? <Text style={styles.blockLine}>Currency {bank.currency}</Text> : null}
          </View>
        </View>

        <View style={styles.items}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colDesc]}>DESCRIPTION</Text>
            <Text style={[styles.th, styles.colQty]}>QTY</Text>
            <Text style={[styles.th, styles.colUnit]}>UNIT PRICE</Text>
            <Text style={[styles.th, styles.colAmount]}>AMOUNT</Text>
          </View>

          {lines.map((line, index) => {
            const item = rateItem(line.rateItemId);
            const asana = line.asanaLinks.map((l) => l.trim()).filter(Boolean);
            const pages = line.pageLinks.map((l) => l.trim()).filter(Boolean);

            return (
              <View
                key={line.key}
                style={[styles.row, ...(index % 2 === 1 ? [styles.rowAlt] : [])]}
                wrap={false}
              >
                <View style={styles.colDesc}>
                  <Text style={styles.desc}>{item?.short ?? line.rateItemId}</Text>
                  {asana.map((url) => (
                    <View key={url} style={styles.linkRow}>
                      <Text style={styles.linkLabel}>ASANA</Text>
                      <Link src={url} style={styles.link}>
                        {shorten(url)}
                      </Link>
                    </View>
                  ))}
                  {pages.map((url) => (
                    <View key={url} style={styles.linkRow}>
                      <Text style={styles.linkLabel}>PAGE</Text>
                      <Link src={url} style={styles.link}>
                        {shorten(url)}
                      </Link>
                    </View>
                  ))}
                </View>
                <Text style={styles.colQty}>{line.qty}</Text>
                <Text style={styles.colUnit}>{formatGBP(line.unitPrice)}</Text>
                <Text style={[styles.colAmount, { fontWeight: 600 }]}>
                  {formatGBP(lineAmount(line))}
                </Text>
              </View>
            );
          })}

          <View style={styles.totalWrap} wrap={false}>
            <View style={styles.total}>
              <Text style={styles.totalLabel}>TOTAL DUE</Text>
              <Text style={styles.totalValue}>{formatGBP(total)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.terms}>
            Fees are payable on the basis of approved and published content only. Every line above
            carries its Asana task link and the published page URL. This invoice covers work signed
            off by the line manager during {monthLabel(invoice.periodMonth)}.
          </Text>
          <Text
            style={styles.pageNo}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** URLs are long; show enough to recognise the page. */
function shorten(url: string, max = 78): string {
  const trimmed = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Register the embedded Open Sans faces. Exported for the Node smoke test. */
export { ensureFonts };

/** Render the invoice to a PDF blob, ready to download. */
export async function buildPdf(invoice: Invoice): Promise<Blob> {
  ensureFonts();
  return pdf(<InvoiceDocument invoice={invoice} />).toBlob();
}
