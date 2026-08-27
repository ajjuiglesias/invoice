import JSZip from 'jszip';
import { lineAmount, sortLines, subtotal, parseIsoDate } from '../domain/invoice';
import { FIRST_ITEM_ROW, LAST_ITEM_ROW, RATE_CARD, rateItem } from '../domain/rate-card';
import type { Invoice, InvoiceLine } from '../domain/types';
import {
  cellStyleId,
  ensureWrappedStyle,
  forceFullRecalc,
  loadStyleSheet,
  setCell,
  setCellStyle,
  setHyperlinks,
  setRowHeightAtLeast,
  toExcelSerial,
  type HyperlinkSpec,
} from './ooxml';

const SHEET = 'xl/worksheets/sheet1.xml';
const SHEET_RELS = 'xl/worksheets/_rels/sheet1.xml.rels';
const STYLES = 'xl/styles.xml';
const WORKBOOK = 'xl/workbook.xml';
const WORKBOOK_RELS = 'xl/_rels/workbook.xml.rels';
const CONTENT_TYPES = '[Content_Types].xml';
const CALC_CHAIN = 'xl/calcChain.xml';

/** Where each field lives on the template's Invoice sheet. */
export const CELLS = {
  invoiceNumber: 'H5',
  issueDate: 'J5',
  fullName: 'F10',
  businessName: 'F12',
  email: 'F13',
  postalAddress: 'F14',
  country: 'F15',
  accountName: 'J9',
  bankName: 'J10',
  sortCode: 'J11',
  accountNumber: 'J12',
  iban: 'J14',
  bicSwift: 'J15',
  currency: 'J16',
  subtotal: 'J48',
} as const;

/** The line-item columns, per row. */
const COL = { asana: 'F', page: 'G', qty: 'H', unitPrice: 'I', amount: 'J' } as const;

/** Template row height in points, per line of wrapped text. */
const POINTS_PER_LINE = 14;

export interface BuildResult {
  blob: Blob;
  /** Subtotal we wrote, for the caller to cross-check. */
  subtotal: number;
}

/**
 * Fill the company's Excel template with an invoice.
 *
 * Every cell we own is written explicitly — including the unused rows, which
 * are reset to qty 0 and their rate-card price. That way nothing from the
 * template or a previous fill can leak into the output.
 */
export async function buildXlsx(templateBytes: ArrayBuffer, invoice: Invoice): Promise<BuildResult> {
  const zip = await JSZip.loadAsync(templateBytes);

  const read = async (path: string): Promise<string> => {
    const file = zip.file(path);
    if (!file) throw new Error(`Template is missing ${path}. Is it the right workbook?`);
    return file.async('string');
  };

  let sheet = await read(SHEET);
  let rels = zip.file(SHEET_RELS) ? await read(SHEET_RELS) : emptyRels();
  const styles = loadStyleSheet(await read(STYLES));

  const { profile } = invoice;
  const hyperlinks: HyperlinkSpec[] = [];

  // ---- Header --------------------------------------------------------------
  sheet = setCell(sheet, CELLS.invoiceNumber, {
    kind: 'number',
    value: invoice.invoiceNumber,
  });
  sheet = setCell(sheet, CELLS.issueDate, {
    kind: 'number',
    value: toExcelSerial(parseIsoDate(invoice.issueDate)),
  });

  // ---- Freelancer details --------------------------------------------------
  sheet = text(sheet, CELLS.fullName, profile.fullName);
  sheet = text(sheet, CELLS.businessName, profile.businessName);
  sheet = text(sheet, CELLS.email, profile.email);
  sheet = text(sheet, CELLS.postalAddress, profile.postalAddress);
  sheet = text(sheet, CELLS.country, profile.country);

  if (profile.email.trim()) {
    hyperlinks.push({ ref: CELLS.email, target: `mailto:${profile.email.trim()}` });
  }

  // ---- Bank details --------------------------------------------------------
  const { bank } = profile;
  sheet = text(sheet, CELLS.accountName, bank.accountName);
  sheet = text(sheet, CELLS.bankName, bank.bankName);
  sheet = text(sheet, CELLS.sortCode, bank.sortCode);
  // Written as text so leading zeros survive.
  sheet = text(sheet, CELLS.accountNumber, bank.accountNumber);
  sheet = text(sheet, CELLS.iban, bank.iban);
  sheet = text(sheet, CELLS.bicSwift, bank.bicSwift);
  sheet = text(sheet, CELLS.currency, bank.currency);

  // ---- Line items ----------------------------------------------------------
  const linesByRow = new Map<number, InvoiceLine>();
  for (const line of sortLines(invoice.lines)) {
    const item = rateItem(line.rateItemId);
    if (!item) continue;
    if (linesByRow.has(item.row)) {
      throw new Error(
        `Two lines both map to template row ${item.row} (${item.short}). Merge them into one line with a higher quantity.`,
      );
    }
    linesByRow.set(item.row, line);
  }

  for (const item of RATE_CARD) {
    if (item.row < FIRST_ITEM_ROW || item.row > LAST_ITEM_ROW) {
      throw new Error(`Rate card row ${item.row} (${item.id}) is outside the template's item rows.`);
    }

    const line = linesByRow.get(item.row);
    const asanaRef = `${COL.asana}${item.row}`;
    const pageRef = `${COL.page}${item.row}`;

    if (!line) {
      sheet = setCell(sheet, asanaRef, { kind: 'blank' });
      sheet = setCell(sheet, pageRef, { kind: 'blank' });
      sheet = setCell(sheet, `${COL.qty}${item.row}`, { kind: 'number', value: 0 });
      sheet = setCell(sheet, `${COL.unitPrice}${item.row}`, { kind: 'number', value: item.price });
      sheet = amountFormula(sheet, item.row, 0);
      continue;
    }

    const asana = clean(line.asanaLinks);
    const pages = clean(line.pageLinks);

    sheet = linkCell(sheet, styles, asanaRef, asana, hyperlinks);
    sheet = linkCell(sheet, styles, pageRef, pages, hyperlinks);
    sheet = setCell(sheet, `${COL.qty}${item.row}`, { kind: 'number', value: line.qty });
    sheet = setCell(sheet, `${COL.unitPrice}${item.row}`, { kind: 'number', value: line.unitPrice });
    sheet = amountFormula(sheet, item.row, lineAmount(line));

    const maxLines = Math.max(asana.length, pages.length, 1);
    if (maxLines > 1) {
      sheet = setRowHeightAtLeast(sheet, item.row, maxLines * POINTS_PER_LINE + 6);
    }
  }

  // ---- Subtotal ------------------------------------------------------------
  const total = subtotal(invoice.lines);
  sheet = setCell(sheet, CELLS.subtotal, {
    kind: 'formula',
    formula: `SUM(J${FIRST_ITEM_ROW}:J${LAST_ITEM_ROW})`,
    cached: total,
  });

  // ---- Hyperlinks ----------------------------------------------------------
  const applied = setHyperlinks(sheet, rels, hyperlinks);
  sheet = applied.sheetXml;
  rels = applied.relsXml;

  // ---- Commit --------------------------------------------------------------
  zip.file(SHEET, sheet);
  zip.file(SHEET_RELS, rels);
  zip.file(STYLES, styles.xml);
  zip.file(WORKBOOK, forceFullRecalc(await read(WORKBOOK)));

  await dropCalcChain(zip);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });

  return { blob, subtotal: total };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(sheet: string, ref: string, value: string): string {
  const trimmed = value.trim();
  return trimmed
    ? setCell(sheet, ref, { kind: 'string', text: trimmed })
    : setCell(sheet, ref, { kind: 'blank' });
}

function clean(links: string[]): string[] {
  return links.map((l) => l.trim()).filter(Boolean);
}

function amountFormula(sheet: string, row: number, cached: number): string {
  // The template's own formula, written explicitly so no shared-formula
  // bookkeeping is left dangling.
  return setCell(sheet, `${COL.amount}${row}`, {
    kind: 'formula',
    formula: `IF(H${row}="",ROUND(1*I${row},2),ROUND(H${row}*I${row},2))`,
    cached,
  });
}

/**
 * Write one or more links into a cell. Excel allows a single hyperlink per
 * cell, so every link is listed as text and the first is made clickable.
 */
function linkCell(
  sheet: string,
  styles: ReturnType<typeof loadStyleSheet>,
  ref: string,
  links: string[],
  hyperlinks: HyperlinkSpec[],
): string {
  if (links.length === 0) return setCell(sheet, ref, { kind: 'blank' });

  let out = setCell(sheet, ref, { kind: 'string', text: links.join('\n') });

  if (links.length > 1) {
    const wrapped = ensureWrappedStyle(styles, cellStyleId(out, ref));
    if (wrapped) out = setCellStyle(out, ref, wrapped);
  }

  hyperlinks.push({ ref, target: links[0] });
  return out;
}

function emptyRels(): string {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
}

/**
 * Excel keeps a dependency cache in calcChain.xml. Once formulas move it goes
 * stale and Excel reports the file as corrupt. Removing it is safe — Excel
 * rebuilds it on the next save.
 */
async function dropCalcChain(zip: JSZip): Promise<void> {
  if (!zip.file(CALC_CHAIN)) return;
  zip.remove(CALC_CHAIN);

  const ctFile = zip.file(CONTENT_TYPES);
  if (ctFile) {
    const ct = await ctFile.async('string');
    zip.file(CONTENT_TYPES, ct.replace(/<Override[^>]*calcChain\.xml"[^>]*\/>/g, ''));
  }

  const relsFile = zip.file(WORKBOOK_RELS);
  if (relsFile) {
    const wbRels = await relsFile.async('string');
    zip.file(WORKBOOK_RELS, wbRels.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/g, ''));
  }
}
