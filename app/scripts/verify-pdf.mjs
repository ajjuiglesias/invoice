/**
 * Smoke test for the branded PDF.
 *
 * Renders a sample invoice in Node and checks the result is a real PDF with
 * embedded fonts, one clickable annotation per link, and correct pagination
 * for a long invoice. Writes the sample to node_modules/.cache so it can be
 * opened and eyeballed.
 *
 * Run with:  npm run verify:pdf
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');

// Asset paths inside the component are relative to the app directory.
process.chdir(appDir);

async function loadDocument() {
  const outfile = path.join(appDir, 'node_modules', '.cache', 'verify-pdf.mjs');
  await mkdir(path.dirname(outfile), { recursive: true });

  await build({
    entryPoints: [path.join(appDir, 'src/export/pdf.tsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    outfile,
    external: ['@react-pdf/renderer', 'react'],
    logLevel: 'silent',
  });

  return import(pathToFileURL(outfile).href);
}

const ASANA = 'https://app.asana.com/1/452022615405114/project/1216657422903038/task/121710947';
const PAGE = 'https://www.juliacharleseventmanagement.co.uk/unique-ways-to-make-your-brand-stand-out/';

const profile = {
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
    iban: 'GB33BUKB20201555555555',
    bicSwift: 'BUKBGB22',
    currency: 'GBP',
  },
};

const line = (key, rateItemId, qty, unitPrice, links = 1) => ({
  key,
  rateItemId,
  qty,
  unitPrice,
  asanaLinks: Array.from({ length: links }, (_, i) => `${ASANA}${i}`),
  pageLinks: Array.from({ length: links }, (_, i) => `${PAGE}${i}`),
});

const SAMPLE = {
  id: 'pdf-sample',
  invoiceNumber: 4,
  issueDate: '2026-08-27',
  periodMonth: '2026-08',
  rateCardVersion: '2026-08',
  createdAt: '2026-08-27T00:00:00.000Z',
  profile,
  lines: [
    line('a', 'act-end-new', 1, 35, 1),
    line('b', 'blog-new', 2, 80, 2),
    line('c', 'concept-of-3', 1, 40, 1),
  ],
};

/** Every task type at once, to force multi-page output. */
const LONG = {
  ...SAMPLE,
  id: 'pdf-long',
  lines: [
    'act-end-new', 'act-end-additional-section', 'act-end-refresh', 'quick-edits',
    'quick-edits-3-5', 'quick-edits-6-8', 'quick-edits-8-10', 'blog-new', 'blog-refresh',
    'blog-edit', 'carousel-multi-image', 'carousel-text-image', 'carousel-pdf-collage',
    'carousel-expanded', 'artist-job-callouts', 'article-posts', 'concept-of-3',
    'video-basic-social', 'video-intermediate-social', 'bts-clips-1', 'bts-clips-3-5',
    'video-grid-gif', 'video-intermediate-yt', 'video-advanced-yt', 'event-page-new',
    'event-page-update', 'event-page-edit', 'pinterest-5-pins', 'adhoc',
  ].map((id, i) => line(`l${i}`, id, 1, 20, 2)),
};

let failures = 0;
let checks = 0;

function checkTrue(label, condition, detail = '') {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ''}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

function check(label, actual, expected) {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.log(`  FAIL  ${label}\n          expected: ${expected}\n          actual:   ${actual}`);
  } else {
    console.log(`  ok    ${label}`);
  }
}

/** Count PDF objects without a parser — latin1 keeps byte offsets intact. */
function inspect(buffer) {
  const raw = buffer.toString('latin1');
  return {
    isPdf: raw.startsWith('%PDF-'),
    pages: (raw.match(/\/Type\s*\/Page[^s]/g) || []).length,
    links: (raw.match(/\/Subtype\s*\/Link/g) || []).length,
    fonts: [...new Set(raw.match(/\/BaseFont\s*\/[A-Za-z0-9+\-]+/g) || [])],
    hasImage: /\/Subtype\s*\/Image/.test(raw),
    raw,
  };
}

async function main() {
  const mod = await loadDocument();
  const { InvoiceDocument, ensureFonts } = mod;
  ensureFonts();

  console.log('\nSample invoice');
  const buffer = await renderToBuffer(React.createElement(InvoiceDocument, { invoice: SAMPLE }));
  const pdf = inspect(buffer);

  checkTrue('renders a real PDF', pdf.isPdf, `header was ${buffer.subarray(0, 8).toString()}`);
  check('fits on one page', pdf.pages, 1);

  // 1 + 2 + 1 asana links, and the same again for page links.
  const expectedLinks = SAMPLE.lines.reduce(
    (n, l) => n + l.asanaLinks.length + l.pageLinks.length,
    0,
  );
  check('one clickable annotation per link', pdf.links, expectedLinks);

  checkTrue('embeds the logo', pdf.hasImage);
  checkTrue(
    'embeds all three Open Sans weights',
    ['Regular', 'SemiBold', 'Bold'].every((w) => pdf.fonts.some((f) => f.includes(w))),
    pdf.fonts.join(', ') || 'no fonts embedded',
  );
  checkTrue(
    'does not silently fall back to Helvetica',
    !pdf.fonts.some((f) => /Helvetica|Times/.test(f)),
    pdf.fonts.join(', '),
  );

  const outPath = path.join(appDir, 'node_modules', '.cache', 'sample-invoice.pdf');
  await writeFile(outPath, buffer);
  console.log(`\n  wrote ${path.relative(appDir, outPath)} (${buffer.length} bytes)`);

  console.log('\nLong invoice (every task type)');
  const longBuffer = await renderToBuffer(React.createElement(InvoiceDocument, { invoice: LONG }));
  const longPdf = inspect(longBuffer);

  checkTrue('renders a real PDF', longPdf.isPdf);
  checkTrue('flows onto multiple pages', longPdf.pages > 1, `pages: ${longPdf.pages}`);
  check(
    'keeps every link across pages',
    longPdf.links,
    LONG.lines.reduce((n, l) => n + l.asanaLinks.length + l.pageLinks.length, 0),
  );

  const longPath = path.join(appDir, 'node_modules', '.cache', 'sample-invoice-long.pdf');
  await writeFile(longPath, longBuffer);
  console.log(`\n  wrote ${path.relative(appDir, longPath)} (${longBuffer.length} bytes, ${longPdf.pages} pages)`);

  console.log(
    `\n${failures === 0 ? 'PASS' : 'FAIL'} — ${checks - failures}/${checks} checks passed\n`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
