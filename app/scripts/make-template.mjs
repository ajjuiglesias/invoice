/**
 * Produces `public/template.xlsx`: the company's workbook with every
 * freelancer-specific value stripped out.
 *
 * Source of truth is one of the real invoices in the project root. We scrub it
 * rather than hand-building a workbook so that all styling, merges, the logo
 * drawing, printer settings and the "How To" sheet survive byte-for-byte.
 *
 * Idempotent: if no source invoice is present but public/template.xlsx already
 * exists, this is a no-op, so the app still builds once the originals are gone.
 */

import { readFile, writeFile, readdir, mkdir, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const projectRoot = path.resolve(appDir, '..');
const outPath = path.join(appDir, 'public', 'template.xlsx');

const SHEET = 'xl/worksheets/sheet1.xml';
const SHEET_RELS = 'xl/worksheets/_rels/sheet1.xml.rels';
const SHARED = 'xl/sharedStrings.xml';
const WORKBOOK = 'xl/workbook.xml';
const WORKBOOK_RELS = 'xl/_rels/workbook.xml.rels';
const CONTENT_TYPES = '[Content_Types].xml';
const CALC_CHAIN = 'xl/calcChain.xml';

const FIRST_ROW = 19;
const LAST_ROW = 47;

/** Cells holding freelancer-specific values. All get blanked. */
const PERSONAL_CELLS = [
  'H5', 'J5',                                  // invoice number, issue date
  'F10', 'F12', 'F13', 'F14', 'F15',           // freelancer details
  'J9', 'J10', 'J11', 'J12', 'J14', 'J15', 'J16', // bank details
];

async function findSource() {
  const explicit = process.argv[2];
  if (explicit) return path.resolve(explicit);

  const entries = await readdir(projectRoot);
  const candidates = entries
    .filter((f) => /^Invoice .*\.xlsx$/i.test(f) && !f.startsWith('~$'))
    .map((f) => path.join(projectRoot, f));

  if (candidates.length === 0) return null;

  // Prefer a workbook that still has live formulas in the amount column.
  for (const file of candidates) {
    const zip = await JSZip.loadAsync(await readFile(file));
    const sheet = await zip.file(SHEET)?.async('string');
    if (sheet && /<f>IF\(H\d+=""/.test(sheet)) return file;
  }
  return candidates[0];
}

/** Blank a cell: keep its style, drop its type and value. */
function blankCell(xml, ref) {
  const re = new RegExp(`<c[^>]*\\br="${ref}"[^>]*?(/>|>)`);
  const m = re.exec(xml);
  if (!m) return xml;

  const style = /\bs="(\d+)"/.exec(m[0]);
  const replacement = `<c r="${ref}"${style ? ` s="${style[1]}"` : ''}/>`;

  if (m[1] === '/>') {
    return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length);
  }
  const close = xml.indexOf('</c>', m.index + m[0].length);
  if (close === -1) return xml;
  return xml.slice(0, m.index) + replacement + xml.slice(close + 4);
}

/** Replace a cell's contents with a plain numeric value, keeping its style. */
function setNumber(xml, ref, value) {
  const re = new RegExp(`<c[^>]*\\br="${ref}"[^>]*?(/>|>)`);
  const m = re.exec(xml);
  if (!m) return xml;

  const style = /\bs="(\d+)"/.exec(m[0]);
  const replacement = `<c r="${ref}"${style ? ` s="${style[1]}"` : ''}><v>${value}</v></c>`;

  if (m[1] === '/>') {
    return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length);
  }
  const close = xml.indexOf('</c>', m.index + m[0].length);
  if (close === -1) return xml;
  return xml.slice(0, m.index) + replacement + xml.slice(close + 4);
}

/** Rewrite a cell as an explicit amount formula, dropping shared-formula refs. */
function setAmountFormula(xml, row) {
  const ref = `J${row}`;
  const re = new RegExp(`<c[^>]*\\br="${ref}"[^>]*?(/>|>)`);
  const m = re.exec(xml);
  if (!m) return xml;

  const style = /\bs="(\d+)"/.exec(m[0]);
  const formula = `IF(H${row}=&quot;&quot;,ROUND(1*I${row},2),ROUND(H${row}*I${row},2))`;
  const replacement =
    `<c r="${ref}"${style ? ` s="${style[1]}"` : ''}><f>${formula}</f><v>0</v></c>`;

  if (m[1] === '/>') {
    return xml.slice(0, m.index) + replacement + xml.slice(m.index + m[0].length);
  }
  const close = xml.indexOf('</c>', m.index + m[0].length);
  if (close === -1) return xml;
  return xml.slice(0, m.index) + replacement + xml.slice(close + 4);
}

/** Blank every shared string no cell references any more. */
function scrubSharedStrings(sharedXml, sheetXmls) {
  const referenced = new Set();
  for (const sheet of sheetXmls) {
    for (const m of sheet.matchAll(/<c[^>]*\bt="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
      referenced.add(Number(m[1]));
    }
  }

  const open = /<sst\b[^>]*>/.exec(sharedXml);
  if (!open) return sharedXml;

  const bodyStart = open.index + open[0].length;
  const bodyEnd = sharedXml.lastIndexOf('</sst>');
  const body = sharedXml.slice(bodyStart, bodyEnd);

  const items = [...body.matchAll(/<si>[\s\S]*?<\/si>|<si\/>/g)].map((m) => m[0]);
  let blanked = 0;

  const rebuilt = items
    .map((si, i) => {
      if (referenced.has(i)) return si;
      if (si === '<si><t xml:space="preserve"></t></si>') return si;
      blanked += 1;
      return '<si><t xml:space="preserve"></t></si>';
    })
    .join('');

  const openTag = open[0]
    .replace(/\bcount="\d+"/, `count="${items.length}"`)
    .replace(/\buniqueCount="\d+"/, `uniqueCount="${items.length}"`);

  console.log(`  blanked ${blanked} unreferenced shared string(s)`);
  return sharedXml.slice(0, open.index) + openTag + rebuilt + '</sst>';
}

async function main() {
  const source = await findSource();

  if (!source) {
    if (existsSync(outPath)) {
      console.log('No source invoice found; keeping the existing public/template.xlsx.');
      return;
    }
    console.error(
      'No source invoice found in the project root and no public/template.xlsx exists.\n' +
        'Put an "Invoice <Month> <Year> <Name>.xlsx" beside the app folder, or pass a path:\n' +
        '  node scripts/make-template.mjs ../path/to/invoice.xlsx',
    );
    process.exit(1);
  }

  console.log(`Scrubbing template from: ${path.basename(source)}`);
  const zip = await JSZip.loadAsync(await readFile(source));

  let sheet = await zip.file(SHEET).async('string');

  for (const ref of PERSONAL_CELLS) sheet = blankCell(sheet, ref);

  for (let row = FIRST_ROW; row <= LAST_ROW; row += 1) {
    sheet = blankCell(sheet, `F${row}`);
    sheet = blankCell(sheet, `G${row}`);
    sheet = setNumber(sheet, `H${row}`, 0);
    sheet = setAmountFormula(sheet, row);
  }

  sheet = setNumber(sheet, 'J48', 0).replace(
    /<c r="J48"([^>]*)><v>0<\/v><\/c>/,
    `<c r="J48"$1><f>SUM(J${FIRST_ROW}:J${LAST_ROW})</f><v>0</v></c>`,
  );

  // Drop all hyperlinks; the app rebuilds them per invoice.
  sheet = sheet.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, '');
  zip.file(SHEET, sheet);

  const relsFile = zip.file(SHEET_RELS);
  if (relsFile) {
    const rels = await relsFile.async('string');
    zip.file(
      SHEET_RELS,
      rels.replace(/<Relationship\b[^>]*\/hyperlink"[^>]*\/>/g, ''),
    );
  }

  // Shared strings: blank anything now unreferenced (names, emails, links...).
  const sharedFile = zip.file(SHARED);
  if (sharedFile) {
    const sheet2 = zip.file('xl/worksheets/sheet2.xml');
    const others = sheet2 ? [await sheet2.async('string')] : [];
    zip.file(SHARED, scrubSharedStrings(await sharedFile.async('string'), [sheet, ...others]));
  }

  // Force a full recalculation when the finished invoice is opened.
  const workbook = await zip.file(WORKBOOK).async('string');
  zip.file(
    WORKBOOK,
    /<calcPr\b[^>]*\/>/.test(workbook)
      ? workbook.replace(/<calcPr\b([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>')
      : workbook.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>'),
  );

  // calcChain goes stale the moment formulas change; Excel rebuilds it.
  if (zip.file(CALC_CHAIN)) {
    zip.remove(CALC_CHAIN);
    const ct = await zip.file(CONTENT_TYPES).async('string');
    zip.file(CONTENT_TYPES, ct.replace(/<Override[^>]*calcChain\.xml"[^>]*\/>/g, ''));
    const wbRels = await zip.file(WORKBOOK_RELS).async('string');
    zip.file(WORKBOOK_RELS, wbRels.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/g, ''));
  }

  // Authorship metadata.
  for (const part of ['docProps/core.xml']) {
    const file = zip.file(part);
    if (!file) continue;
    const xml = await file.async('string');
    zip.file(
      part,
      xml
        .replace(/<dc:creator>[\s\S]*?<\/dc:creator>/, '<dc:creator></dc:creator>')
        .replace(/<cp:lastModifiedBy>[\s\S]*?<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy></cp:lastModifiedBy>'),
    );
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });
  await writeFile(outPath, out);

  await access(outPath);
  console.log(`Wrote ${path.relative(projectRoot, outPath)} (${out.length} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
