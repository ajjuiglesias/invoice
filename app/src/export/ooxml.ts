/**
 * Minimal, surgical SpreadsheetML editing.
 *
 * We deliberately do NOT parse and re-serialise the workbook with a library.
 * The company's template carries styling, merges, a drawing, printer settings
 * and a second "How To" sheet that must survive untouched. So we edit the raw
 * XML of only the cells we own and leave every other byte exactly as it was.
 */

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function splitRef(ref: string): { col: string; colIndex: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!m) throw new Error(`Bad cell reference: ${ref}`);
  return { col: m[1].toUpperCase(), colIndex: colToIndex(m[1]), row: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

/** Escape text for an XML text node, dropping characters Excel rejects. */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function xmlEscapeAttr(s: string): string {
  return xmlEscape(s).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Cell values
// ---------------------------------------------------------------------------

export type CellValue =
  | { kind: 'blank' }
  | { kind: 'number'; value: number }
  | { kind: 'string'; text: string }
  | { kind: 'formula'; formula: string; cached: number };

/** Excel's day-zero is 1899-12-30 (its 1900 leap-year bug baked in). */
export function toExcelSerial(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - epoch) / 86400000);
}

// ---------------------------------------------------------------------------
// Row / cell surgery
// ---------------------------------------------------------------------------

interface RowSpan {
  /** Index of '<row' in the document. */
  start: number;
  /** Index just past '</row>' (or past '/>' for an empty row). */
  end: number;
  /** The full '<row ...>' open tag. */
  openTag: string;
  /** Everything between the open tag and '</row>'. Empty for a self-closed row. */
  inner: string;
  selfClosing: boolean;
}

function findRow(xml: string, row: number): RowSpan | null {
  const re = new RegExp(`<row[^>]*\\br="${row}"[^>]*?(/>|>)`);
  const m = re.exec(xml);
  if (!m) return null;

  const start = m.index;
  const openTag = m[0];

  if (m[1] === '/>') {
    return { start, end: start + openTag.length, openTag, inner: '', selfClosing: true };
  }

  const closeIdx = xml.indexOf('</row>', start + openTag.length);
  if (closeIdx === -1) throw new Error(`Unterminated <row r="${row}">`);

  return {
    start,
    end: closeIdx + '</row>'.length,
    openTag,
    inner: xml.slice(start + openTag.length, closeIdx),
    selfClosing: false,
  };
}

function replaceRow(xml: string, span: RowSpan, openTag: string, inner: string): string {
  return `${xml.slice(0, span.start)}${openTag}${inner}</row>${xml.slice(span.end)}`;
}

/** Locate a <c r="REF" .../> inside a row's inner XML. */
function findCell(inner: string, ref: string): { start: number; end: number; text: string } | null {
  const re = new RegExp(`<c[^>]*\\br="${ref}"[^>]*?(/>|>)`);
  const m = re.exec(inner);
  if (!m) return null;

  const start = m.index;
  if (m[1] === '/>') {
    return { start, end: start + m[0].length, text: m[0] };
  }
  const closeIdx = inner.indexOf('</c>', start + m[0].length);
  if (closeIdx === -1) throw new Error(`Unterminated <c r="${ref}">`);
  const end = closeIdx + '</c>'.length;
  return { start, end, text: inner.slice(start, end) };
}

function styleOf(cellXml: string): string | null {
  const m = /\bs="(\d+)"/.exec(cellXml);
  return m ? m[1] : null;
}

function buildCell(ref: string, styleId: string | null, value: CellValue): string {
  const s = styleId === null ? '' : ` s="${styleId}"`;

  switch (value.kind) {
    case 'blank':
      return `<c r="${ref}"${s}/>`;
    case 'number':
      return `<c r="${ref}"${s}><v>${serialiseNumber(value.value)}</v></c>`;
    case 'string':
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
        value.text,
      )}</t></is></c>`;
    case 'formula':
      return `<c r="${ref}"${s}><f>${xmlEscape(value.formula)}</f><v>${serialiseNumber(
        value.cached,
      )}</v></c>`;
  }
}

function serialiseNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Refusing to write non-finite number: ${n}`);
  // Avoid exponential notation, which Excel will not read back as a number.
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(10)));
}

/**
 * Write a value into a cell, keeping its existing style. Creates the cell (in
 * correct column order) if the template does not already have it.
 */
export function setCell(xml: string, ref: string, value: CellValue): string {
  const { row } = splitRef(ref);
  const span = findRow(xml, row);
  if (!span) throw new Error(`Template has no row ${row} — cannot write ${ref}.`);

  const existing = findCell(span.inner, ref);
  const styleId = existing ? styleOf(existing.text) : null;
  const cell = buildCell(ref, styleId, value);

  let inner: string;
  if (existing) {
    inner = span.inner.slice(0, existing.start) + cell + span.inner.slice(existing.end);
  } else {
    inner = insertCellInOrder(span.inner, ref, cell);
  }

  const openTag = span.selfClosing ? span.openTag.replace(/\/>$/, '>') : span.openTag;
  return replaceRow(xml, span, openTag, inner);
}

function insertCellInOrder(inner: string, ref: string, cell: string): string {
  const target = splitRef(ref).colIndex;
  const cellRe = /<c[^>]*\br="([A-Z]+)(\d+)"[^>]*?(?:\/>|>)/g;

  let m: RegExpExecArray | null;
  while ((m = cellRe.exec(inner))) {
    if (colToIndex(m[1]) > target) return inner.slice(0, m.index) + cell + inner.slice(m.index);
  }
  return inner + cell;
}

/** Read a numeric cell's cached value, for verification. */
export function getCellNumber(xml: string, ref: string): number | null {
  const { row } = splitRef(ref);
  const span = findRow(xml, row);
  if (!span) return null;
  const cell = findCell(span.inner, ref);
  if (!cell) return null;
  const m = /<v>([^<]*)<\/v>/.exec(cell.text);
  return m ? Number(m[1]) : null;
}

/** Read a cell's text, resolving inline strings only. */
export function getCellInlineString(xml: string, ref: string): string | null {
  const { row } = splitRef(ref);
  const span = findRow(xml, row);
  if (!span) return null;
  const cell = findCell(span.inner, ref);
  if (!cell) return null;
  const m = /<is><t[^>]*>([\s\S]*?)<\/t><\/is>/.exec(cell.text);
  return m ? unescapeXml(m[1]) : null;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Raise a row's height so wrapped multi-line content stays visible. */
export function setRowHeightAtLeast(xml: string, row: number, height: number): string {
  const span = findRow(xml, row);
  if (!span) return xml;

  const current = /\bht="([\d.]+)"/.exec(span.openTag);
  const currentHeight = current ? Number(current[1]) : 15;
  if (currentHeight >= height) return xml;

  let openTag = span.openTag;
  openTag = current
    ? openTag.replace(/\bht="[\d.]+"/, `ht="${height}"`)
    : openTag.replace(/^<row/, `<row ht="${height}"`);
  if (!/\bcustomHeight="1"/.test(openTag)) {
    openTag = openTag.replace(/^<row/, '<row customHeight="1"');
  }

  if (span.selfClosing) {
    return xml.slice(0, span.start) + openTag + xml.slice(span.end);
  }
  return replaceRow(xml, span, openTag, span.inner);
}

// ---------------------------------------------------------------------------
// Styles: clone an xf with wrapText enabled
// ---------------------------------------------------------------------------

/** Split <cellXfs> into its sibling <xf> elements. They never nest. */
function splitXfs(body: string): string[] {
  const out: string[] = [];
  let i = body.indexOf('<xf');
  while (i !== -1) {
    const next = body.indexOf('<xf', i + 3);
    out.push(next === -1 ? body.slice(i) : body.slice(i, next));
    i = next;
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export interface StyleSheet {
  xml: string;
  /** styleId -> wrapped equivalent styleId */
  wrapCache: Map<string, string>;
}

export function loadStyleSheet(xml: string): StyleSheet {
  return { xml, wrapCache: new Map() };
}

/**
 * Return a style id equivalent to `styleId` but with wrapText and top vertical
 * alignment, appending a new <xf> to the stylesheet if one is needed.
 */
export function ensureWrappedStyle(sheet: StyleSheet, styleId: string | null): string | null {
  if (styleId === null) return null;

  const cached = sheet.wrapCache.get(styleId);
  if (cached) return cached;

  const m = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(sheet.xml);
  if (!m) throw new Error('styles.xml has no <cellXfs>');

  const xfs = splitXfs(m[2]);
  const source = xfs[Number(styleId)];
  if (!source) return styleId;

  if (/wrapText="1"/.test(source)) {
    sheet.wrapCache.set(styleId, styleId);
    return styleId;
  }

  const clone = wrapifyXf(source);
  const newId = String(xfs.length);
  const rebuilt = `<cellXfs count="${xfs.length + 1}">${xfs.join('')}${clone}</cellXfs>`;
  sheet.xml = sheet.xml.slice(0, m.index) + rebuilt + sheet.xml.slice(m.index + m[0].length);
  sheet.wrapCache.set(styleId, newId);
  return newId;
}

function wrapifyXf(xf: string): string {
  let out = xf;

  if (!/\bapplyAlignment="1"/.test(out)) {
    out = out.replace(/^<xf\b/, '<xf applyAlignment="1"');
  }

  const alignment = /<alignment\b([^>]*?)\/>/.exec(out);
  if (alignment) {
    let attrs = alignment[1];
    if (!/\bwrapText=/.test(attrs)) attrs += ' wrapText="1"';
    if (!/\bvertical=/.test(attrs)) attrs += ' vertical="top"';
    return out.replace(/<alignment\b[^>]*?\/>/, `<alignment${attrs}/>`);
  }

  // No alignment child: turn a self-closing xf into one that has a child.
  if (/\/>\s*$/.test(out)) {
    return out.replace(/\/>\s*$/, '><alignment wrapText="1" vertical="top"/></xf>');
  }
  return out.replace(/<\/xf>\s*$/, '<alignment wrapText="1" vertical="top"/></xf>');
}

/** The style id currently on a cell, or null if the cell/style is absent. */
export function cellStyleId(xml: string, ref: string): string | null {
  const { row } = splitRef(ref);
  const span = findRow(xml, row);
  if (!span) return null;
  const cell = findCell(span.inner, ref);
  return cell ? styleOf(cell.text) : null;
}

/** Force a cell to use a given style id, preserving its value. */
export function setCellStyle(xml: string, ref: string, styleId: string): string {
  const { row } = splitRef(ref);
  const span = findRow(xml, row);
  if (!span) return xml;
  const cell = findCell(span.inner, ref);
  if (!cell) return xml;

  const updated = /\bs="\d+"/.test(cell.text)
    ? cell.text.replace(/\bs="\d+"/, `s="${styleId}"`)
    : cell.text.replace(/^<c/, `<c s="${styleId}"`);

  const inner = span.inner.slice(0, cell.start) + updated + span.inner.slice(cell.end);
  return replaceRow(xml, span, span.openTag, inner);
}

// ---------------------------------------------------------------------------
// Hyperlinks
// ---------------------------------------------------------------------------

export interface HyperlinkSpec {
  ref: string;
  target: string;
}

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HYPERLINK_TYPE = `${REL_NS.replace('/package/', '/officeDocument/')}/hyperlink`;

/**
 * Replace every hyperlink on the sheet. Rewrites both the <hyperlinks> block
 * and the sheet's relationship part, preserving non-hyperlink relationships
 * (the drawing and printer settings) and their original ids.
 */
export function setHyperlinks(
  sheetXml: string,
  relsXml: string,
  links: HyperlinkSpec[],
): { sheetXml: string; relsXml: string } {
  const kept = [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((m) => m[0])
    .filter((rel) => !/\/hyperlink"/.test(rel));

  const usedIds = new Set(
    kept.map((rel) => /\bId="([^"]+)"/.exec(rel)?.[1]).filter((x): x is string => !!x),
  );

  let counter = 1;
  const nextId = () => {
    let id = `rIdHL${counter++}`;
    while (usedIds.has(id)) id = `rIdHL${counter++}`;
    usedIds.add(id);
    return id;
  };

  const entries = links.map((link) => ({ ...link, id: nextId() }));

  const newRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n` +
    `<Relationships xmlns="${REL_NS}">` +
    kept.join('') +
    entries
      .map(
        (e) =>
          `<Relationship Id="${e.id}" Type="${HYPERLINK_TYPE}" Target="${xmlEscapeAttr(
            e.target,
          )}" TargetMode="External"/>`,
      )
      .join('') +
    `</Relationships>`;

  const block = entries.length
    ? `<hyperlinks>${entries
        .map(
          (e) =>
            `<hyperlink ref="${e.ref}" r:id="${e.id}" display="${xmlEscapeAttr(e.target)}"/>`,
        )
        .join('')}</hyperlinks>`
    : '';

  let out = sheetXml;
  if (/<hyperlinks>[\s\S]*?<\/hyperlinks>/.test(out)) {
    out = out.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, block);
  } else if (block) {
    // Schema order: hyperlinks must sit before printOptions / pageMargins.
    const anchor = /<printOptions\b|<pageMargins\b/.exec(out);
    if (!anchor) throw new Error('Cannot find an anchor to insert <hyperlinks> before.');
    out = out.slice(0, anchor.index) + block + out.slice(anchor.index);
  }

  return { sheetXml: out, relsXml: newRels };
}

// ---------------------------------------------------------------------------
// Workbook-level
// ---------------------------------------------------------------------------

/** Make Excel recalculate every formula when the file is opened. */
export function forceFullRecalc(workbookXml: string): string {
  if (/<calcPr\b[^>]*\/>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr\b([^>]*?)\/>/, (_full, attrs: string) => {
      let a = attrs.replace(/\s*fullCalcOnLoad="[^"]*"/, '');
      return `<calcPr${a} fullCalcOnLoad="1"/>`;
    });
  }
  return workbookXml.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
}
