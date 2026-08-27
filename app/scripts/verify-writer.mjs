/**
 * Verification harness for the XLSX writer.
 *
 * Rebuilds a real, previously-submitted invoice from its data and checks the
 * generated workbook against the original: same values in the same cells, the
 * same subtotal, formulas still live, and every non-data part of the template
 * byte-identical.
 *
 * Run with:  npm run verify
 */

import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const projectRoot = path.resolve(appDir, '..');

// The writer is TypeScript and uses extensionless imports, so bundle it first.
// The bundle is written inside the app so that `jszip` still resolves from
// node_modules at import time.
async function loadWriter() {
  const outfile = path.join(appDir, 'node_modules', '.cache', 'verify-writer.mjs');
  await mkdir(path.dirname(outfile), { recursive: true });

  await build({
    entryPoints: [path.join(appDir, 'src/export/xlsx.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    external: ['jszip'],
    logLevel: 'silent',
  });

  return import(pathToFileURL(outfile).href);
}

// ---------------------------------------------------------------------------
// The August 2026 invoice, transcribed from the real workbook.
// ---------------------------------------------------------------------------

const ASANA_ACT_END =
  'https://app.asana.com/1/452022615405114/project/1216657422903038/task/1217109473885706?focus=true';
const ASANA_BLOG =
  'https://app.asana.com/1/452022615405114/project/1216657422903038/task/1216242003301702?focus=true';
const URL_ACT_END =
  'https://www.juliacharleseventmanagement.co.uk/?post_type=entertainment&p=94747&preview=true';
const URL_BLOG =
  'https://www.juliacharleseventmanagement.co.uk/unique-ways-to-make-your-brand-stand-out/';

const AUGUST_INVOICE = {
  id: 'verify-august-2026',
  invoiceNumber: 3,
  issueDate: '2026-08-27',
  periodMonth: '2026-08',
  rateCardVersion: '2026-08',
  createdAt: '2026-08-27T00:00:00.000Z',
  profile: {
    fullName: 'Md Ajmal Hossain',
    businessName: 'Ajju Iglesias',
    email: 'ajjuiglesias@gmail.com',
    postalAddress: 'Mohona, Manikchak, Malda, West Bengal, India 732202',
    country: 'India',
    bank: {
      accountName: 'Md Ajmal Hossain',
      bankName: 'Barclays',
      sortCode: '23-14-86',
      accountNumber: '15889046',
      iban: '',
      bicSwift: '',
      currency: '',
    },
  },
  lines: [
    {
      key: 'l1',
      rateItemId: 'act-end-new',
      qty: 1,
      unitPrice: 35,
      asanaLinks: [ASANA_ACT_END],
      pageLinks: [URL_ACT_END],
    },
    {
      key: 'l2',
      rateItemId: 'blog-new',
      qty: 2,
      unitPrice: 80,
      asanaLinks: [ASANA_BLOG],
      pageLinks: [URL_BLOG],
    },
    {
      key: 'l3',
      rateItemId: 'blog-edit',
      qty: 1,
      unitPrice: 20,
      asanaLinks: [
        'https://app.asana.com/1/452022615405114/project/1216657422903038/task/1217536482000000?focus=true',
      ],
      pageLinks: [
        'https://www.juliacharleseventmanagement.co.uk/event-services/christmas-event-services/',
      ],
    },
  ],
};

/** Expected subtotal: 1x35 + 2x80 + 1x20 = 215 (matches the real invoice). */
const EXPECTED_SUBTOTAL = 215;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

let failures = 0;
let checks = 0;

function check(label, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) {
    failures += 1;
    console.log(`  FAIL  ${label}\n          expected: ${expected}\n          actual:   ${actual}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

function checkTrue(label, condition, detail = '') {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

// ---------------------------------------------------------------------------
// Cell readers (independent of the writer, so they can catch its mistakes)
// ---------------------------------------------------------------------------

function cellXml(sheet, ref) {
  const re = new RegExp(`<c[^>]*\\br="${ref}"[^>]*?(/>|>)`);
  const m = re.exec(sheet);
  if (!m) return null;
  if (m[1] === '/>') return m[0];
  const close = sheet.indexOf('</c>', m.index + m[0].length);
  return sheet.slice(m.index, close + 4);
}

function cellText(sheet, shared, ref) {
  const c = cellXml(sheet, ref);
  if (!c) return null;

  const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(c);
  if (inline) return unescape(inline[1]);

  if (/\bt="s"/.test(c)) {
    const v = /<v>(\d+)<\/v>/.exec(c);
    return v ? shared[Number(v[1])] ?? null : null;
  }

  const v = /<v>([^<]*)<\/v>/.exec(c);
  return v ? unescape(v[1]) : null;
}

function cellNumber(sheet, ref) {
  const c = cellXml(sheet, ref);
  if (!c) return null;
  const v = /<v>([^<]*)<\/v>/.exec(c);
  return v ? Number(v[1]) : null;
}

function unescape(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function sharedStrings(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) =>
    m[1] ? [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescape(t[1])).join('') : '',
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const { buildXlsx, CELLS } = await loadWriter();

  const templateBytes = await readFile(path.join(appDir, 'public', 'template.xlsx'));
  const arrayBuffer = templateBytes.buffer.slice(
    templateBytes.byteOffset,
    templateBytes.byteOffset + templateBytes.byteLength,
  );

  const { blob, subtotal } = await buildXlsx(arrayBuffer, AUGUST_INVOICE);
  const outBytes = Buffer.from(await blob.arrayBuffer());

  const out = await JSZip.loadAsync(outBytes);
  const sheet = await out.file('xl/worksheets/sheet1.xml').async('string');
  const shared = sharedStrings(await out.file('xl/sharedStrings.xml')?.async('string'));

  console.log('\nHeader');
  check('invoice number (H5)', cellNumber(sheet, CELLS.invoiceNumber), 3);
  // 2026-08-27 as an Excel serial, matching the original workbook exactly.
  check('issue date (J5)', cellNumber(sheet, CELLS.issueDate), 46261);

  console.log('\nFreelancer details');
  check('full name (F10)', cellText(sheet, shared, CELLS.fullName), 'Md Ajmal Hossain');
  check('business name (F12)', cellText(sheet, shared, CELLS.businessName), 'Ajju Iglesias');
  check('email (F13)', cellText(sheet, shared, CELLS.email), 'ajjuiglesias@gmail.com');
  check(
    'postal address (F14)',
    cellText(sheet, shared, CELLS.postalAddress),
    'Mohona, Manikchak, Malda, West Bengal, India 732202',
  );
  check('country (F15)', cellText(sheet, shared, CELLS.country), 'India');

  console.log('\nBank details');
  check('account name (J9)', cellText(sheet, shared, CELLS.accountName), 'Md Ajmal Hossain');
  check('bank name (J10)', cellText(sheet, shared, CELLS.bankName), 'Barclays');
  check('sort code (J11)', cellText(sheet, shared, CELLS.sortCode), '23-14-86');
  check('account number (J12) keeps leading zeros', cellText(sheet, shared, CELLS.accountNumber), '15889046');

  console.log('\nLine items');
  check('act end page qty (H19)', cellNumber(sheet, 'H19'), 1);
  check('act end page price (I19)', cellNumber(sheet, 'I19'), 35);
  check('act end page amount (J19)', cellNumber(sheet, 'J19'), 35);
  check('act end asana link (F19)', cellText(sheet, shared, 'F19'), ASANA_ACT_END);
  check('act end page link (G19)', cellText(sheet, shared, 'G19'), URL_ACT_END);

  check('new blog qty (H26)', cellNumber(sheet, 'H26'), 2);
  check('new blog amount (J26)', cellNumber(sheet, 'J26'), 160);
  check('new blog asana link (F26)', cellText(sheet, shared, 'F26'), ASANA_BLOG);

  check('blog edit qty (H28)', cellNumber(sheet, 'H28'), 1);
  check('blog edit price (I28)', cellNumber(sheet, 'I28'), 20);
  check('blog edit amount (J28)', cellNumber(sheet, 'J28'), 20);

  console.log('\nUnused rows are reset');
  check('unused qty (H21)', cellNumber(sheet, 'H21'), 0);
  check('unused amount (J21)', cellNumber(sheet, 'J21'), 0);
  check('unused asana link (F21) blank', cellText(sheet, shared, 'F21'), null);
  check('unused rate restored (I27)', cellNumber(sheet, 'I27'), 40);

  console.log('\nTotals');
  check('writer-reported subtotal', subtotal, EXPECTED_SUBTOTAL);
  check('cached subtotal (J48)', cellNumber(sheet, CELLS.subtotal), EXPECTED_SUBTOTAL);
  checkTrue(
    'subtotal formula is live',
    /<c r="J48"[^>]*><f>SUM\(J19:J47\)<\/f>/.test(sheet),
    'SUM(J19:J47) not found on J48',
  );
  // A double quote needs no escaping inside an XML text node, so accept either
  // a literal " or &quot; here.
  const amountFormulas = sheet.match(/<f>IF\(H\d+=(?:"|&quot;)/g) || [];
  checkTrue(
    'all 29 amount formulas are live',
    amountFormulas.length === 29,
    `found ${amountFormulas.length}`,
  );
  checkTrue(
    'no dangling shared formulas',
    !/t="shared"/.test(sheet),
    'a t="shared" formula reference survived',
  );

  console.log('\nHyperlinks');
  const rels = await out.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');
  checkTrue('email is a mailto link', rels.includes('mailto:ajjuiglesias@gmail.com'));
  checkTrue('asana link is clickable', rels.includes(ASANA_ACT_END.replace(/&/g, '&amp;')));
  checkTrue(
    'page url escaped correctly in rels',
    rels.includes(URL_ACT_END.replace(/&/g, '&amp;')),
    'ampersands in the preview URL were not escaped',
  );
  checkTrue('drawing relationship survived', /\/drawing"/.test(rels));
  checkTrue('printer settings relationship survived', /\/printerSettings"/.test(rels));
  checkTrue(
    'hyperlinks sit before printOptions',
    sheet.indexOf('<hyperlinks>') < sheet.indexOf('<printOptions'),
    'schema order violated — Excel will reject the file',
  );

  console.log('\nTemplate integrity');
  const template = await JSZip.loadAsync(templateBytes);
  const untouched = [
    'xl/theme/theme1.xml',
    'xl/media/image1.png',
    'xl/drawings/drawing1.xml',
    'xl/worksheets/sheet2.xml',
    'xl/printerSettings/printerSettings1.bin',
  ];
  for (const part of untouched) {
    const a = await template.file(part)?.async('nodebuffer');
    const b = await out.file(part)?.async('nodebuffer');
    checkTrue(`${part} unchanged`, !!a && !!b && a.equals(b));
  }

  checkTrue('calcChain removed', !out.file('xl/calcChain.xml'));
  const workbook = await out.file('xl/workbook.xml').async('string');
  checkTrue('recalculates on open', /fullCalcOnLoad="1"/.test(workbook));
  const contentTypes = await out.file('[Content_Types].xml').async('string');
  checkTrue('no orphaned calcChain content type', !contentTypes.includes('calcChain'));

  console.log('\nMerged cells and sheet structure');
  const templateSheet = await template.file('xl/worksheets/sheet1.xml').async('string');
  const merges = (s) => /<mergeCells[\s\S]*?<\/mergeCells>/.exec(s)?.[0] ?? '';
  checkTrue('merge definitions unchanged', merges(sheet) === merges(templateSheet));
  const rowCount = (s) => (s.match(/<row\b/g) || []).length;
  check('row count unchanged', rowCount(sheet), rowCount(templateSheet));

  console.log('\nEvery XML part is well-formed');
  for (const name of Object.keys(out.files)) {
    if (!/\.(xml|rels)$/i.test(name)) continue;
    const xml = await out.file(name).async('string');
    const result = XMLValidator.validate(xml, { allowBooleanAttributes: true });
    checkTrue(
      name,
      result === true,
      result === true ? '' : `${result.err?.code}: ${result.err?.msg} (line ${result.err?.line})`,
    );
  }

  await multiLinkScenario(buildXlsx, arrayBuffer);
  await duplicateRowScenario(buildXlsx, arrayBuffer);

  console.log(
    `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`,
  );
  if (failures > 0) process.exit(1);
}

/**
 * Several pieces of work on one line: Excel allows a single hyperlink per cell,
 * so all links must be listed as text with the first made clickable, the cell
 * must wrap, and the row must grow to fit.
 */
async function multiLinkScenario(buildXlsx, templateBuffer) {
  console.log('\nMultiple links on one line');

  const asana = [
    'https://app.asana.com/1/4/project/1/task/111',
    'https://app.asana.com/1/4/project/1/task/222',
    'https://app.asana.com/1/4/project/1/task/333',
  ];
  const pages = [
    'https://www.juliacharleseventmanagement.co.uk/blog-one/',
    'https://www.juliacharleseventmanagement.co.uk/blog-two/',
    'https://www.juliacharleseventmanagement.co.uk/blog-three/',
  ];

  const invoice = {
    ...AUGUST_INVOICE,
    id: 'verify-multilink',
    lines: [
      { key: 'm1', rateItemId: 'blog-new', qty: 3, unitPrice: 80, asanaLinks: asana, pageLinks: pages },
    ],
  };

  const { blob } = await buildXlsx(templateBuffer, invoice);
  const zip = await JSZip.loadAsync(Buffer.from(await blob.arrayBuffer()));
  const sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const styles = await zip.file('xl/styles.xml').async('string');
  const rels = await zip.file('xl/worksheets/_rels/sheet1.xml.rels').async('string');

  check('all three asana links kept (F26)', cellText(sheet, [], 'F26'), asana.join('\n'));
  check('all three page links kept (G26)', cellText(sheet, [], 'G26'), pages.join('\n'));
  check('quantity (H26)', cellNumber(sheet, 'H26'), 3);
  check('amount (J26)', cellNumber(sheet, 'J26'), 240);

  checkTrue('first asana link is the clickable one', rels.includes(asana[0]));
  checkTrue('later links are not separate hyperlinks', !rels.includes(asana[2]));

  const styleId = /<c[^>]*\br="F26"[^>]*\bs="(\d+)"/.exec(sheet)?.[1];
  const xfs = [
    ...(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? '').matchAll(
      /<xf\b[\s\S]*?(?=<xf\b|$)/g,
    ),
  ].map((m) => m[0]);
  checkTrue(
    'link cell wraps its text',
    !!styleId && /wrapText="1"/.test(xfs[Number(styleId)] ?? ''),
    `style ${styleId} has no wrapText`,
  );

  const rowHeight = Number(/<row[^>]*\br="26"[^>]*\bht="([\d.]+)"/.exec(sheet)?.[1] ?? 0);
  checkTrue('row 26 grew to fit three lines', rowHeight >= 3 * 14, `height is ${rowHeight}`);

  const cellXfsCount = Number(/<cellXfs count="(\d+)"/.exec(styles)?.[1] ?? 0);
  const actualXfs = xfs.length;
  check('cellXfs count matches the number of styles', cellXfsCount, actualXfs);

  const valid = XMLValidator.validate(styles, { allowBooleanAttributes: true });
  checkTrue('styles.xml still well-formed after cloning', valid === true, JSON.stringify(valid));
}

/** Two lines cannot share a template row — that would silently drop money. */
async function duplicateRowScenario(buildXlsx, templateBuffer) {
  console.log('\nGuards');

  const invoice = {
    ...AUGUST_INVOICE,
    id: 'verify-duplicate',
    lines: [
      { key: 'd1', rateItemId: 'blog-new', qty: 1, unitPrice: 80, asanaLinks: ['x'], pageLinks: ['y'] },
      { key: 'd2', rateItemId: 'blog-new', qty: 1, unitPrice: 80, asanaLinks: ['x'], pageLinks: ['y'] },
    ],
  };

  let threw = false;
  try {
    await buildXlsx(templateBuffer, invoice);
  } catch {
    threw = true;
  }
  checkTrue('two lines on the same row are rejected', threw);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
