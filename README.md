# JCEM Freelancer Invoice Generator

A web app for Julia Charles Event Management freelancers. Pick the task types you
completed, attach the Asana task and published page for each, and it produces
**the company's own Excel template, filled in** plus a **branded PDF**, ready to
email to your line manager.

No server, no accounts, no database. Everything runs in the browser and your
details never leave your computer.

---

## For freelancers

1. Open the app.
2. **Your details** — fill in your name, address and bank details once. They are
   saved in your browser and pre-filled every month after that.
3. **Build invoice** — pick each task type you completed, set the quantity, and
   paste in the Asana task link and the live page URL for each piece of work.
   The app checks as you go: it flags missing links, preview/draft URLs, and the
   same Asana task being invoiced twice.
4. **Review & send** — download the two files, then click **Open in Gmail**. The
   email is pre-addressed to `accounts@juliacharles.co.uk` with
   `stacy@juliacharles.co.uk` copied in, subject and body written. Attach the
   two files and send.

Next month, open **Past invoices** and hit **Copy to ‹month›**. You get the same
task types and quantities with a fresh invoice number and empty link fields —
ready for the new month's work. **Edit** reopens an invoice in place instead, for
correcting one you have already generated.

Both files download directly — no print dialog. The PDF is a real vector PDF
with Open Sans embedded, so the text stays selectable and the Asana and page
links stay clickable for whoever reviews it.

### The rules it enforces

Taken from the template's own *How To* sheet:

- Invoice monthly, for approved and **published** content only.
- Every line needs an Asana link **and** the published page link.
- Only invoice work signed off by your line manager.
- Submit at least **5 working days before the last day of the month** — the app
  works this date out for you, skipping weekends and bank holidays, and warns as
  it approaches.

---

## For whoever maintains it

### Running locally

```bash
cd app && npm install && npm run dev
```

### Checks

```bash
cd app && npm run check
```

That runs everything CI runs: typecheck, unit tests, the Excel writer harness
and the PDF smoke test. The individual pieces:

| Command | What it covers |
| --- | --- |
| `npm run test` | Rate card invariants, totals and rounding, the deadline maths, and every validation rule. |
| `npm run verify` | The Excel writer, cell by cell. |
| `npm run verify:pdf` | The branded PDF. |

**`npm run verify` is the one that must never go red.** It rebuilds a real,
previously-submitted invoice and asserts that values land in the right cells,
the subtotal matches, all 29 amount formulas and `SUM(J19:J47)` stay live,
hyperlinks resolve, every XML part is well-formed, and the theme, logo drawing,
printer settings and *How To* sheet come out byte-identical to the template.

`npm run verify:pdf` renders a sample invoice and a deliberately long one, and
checks the output is a real PDF with all three Open Sans weights embedded (never
silently falling back to Helvetica), one clickable annotation per link, and
correct pagination. It writes the samples to `node_modules/.cache/` so you can
open and eyeball them.

CI runs all of this on every push and pull request — see
`.github/workflows/ci.yml`.

### Changing a price

Edit `app/src/domain/rate-card.ts` — it is the single source of truth — and bump
`RATE_CARD_VERSION`. Nothing else references prices.

Each entry is pinned to the row it occupies in the template (`row: 19`…`row: 47`).
Those must stay unique and within range, because the template's subtotal is
`SUM(J19:J47)`. The writer refuses to run if that invariant breaks.

### Regenerating the template

`app/public/template.xlsx` is the company workbook with every personal value
stripped out. It is committed, so builds work without the source file present.
To rebuild it from a real invoice:

```bash
cd app && node scripts/make-template.mjs "../Invoice July 2026 Ajju - Copy.xlsx"
```

The scrubber blanks the freelancer, bank and line-item cells, drops all
hyperlinks and the stale `calcChain`, normalises the amount formulas, and blanks
any shared string no longer referenced — so no names, addresses, account numbers
or task URLs survive into the shipped asset.

### Deploying

Static output — anything that serves files will do.

- **Vercel:** set the project root to `app`. `app/vercel.json` handles the rest.
- **Netlify:** `netlify.toml` at the repo root is already configured.

```bash
cd app && npm run build   # → app/dist
```

### Brand

From the brand guidelines deck:

| Role | Hex |
| --- | --- |
| Primary teal | `#0FABAC` |
| Secondary charcoal | `#35383F` |
| Secondary charcoal (alt) | `#3C4147` |
| CTA / highlight red | `#EF3340` |

Headings use *JCEM Semibold* where available, falling back to Open Sans
SemiBold; body copy is Open Sans throughout.

Open Sans is self-hosted in `app/public/fonts/` (Regular, SemiBold, Bold) so
the PDF never depends on a network fetch at render time.

`app/public/logo-dark.png` is the white-and-teal wordmark for charcoal
backgrounds; `app/public/logo.png` is the charcoal-and-teal version for white
backgrounds. Both were extracted from the guidelines deck with transparent
backgrounds — swap in official artwork if you get the vector files.

---

## How it is put together

```
app/src/
  domain/     rate card, invoice model, totals, dates, validation (+ tests)
  export/     ooxml.ts (surgical SpreadsheetML editing), xlsx.ts (the writer),
              pdf.tsx (the branded PDF)
  store/      StorageAdapter interface + LocalStorageAdapter
  mail/       MailAdapter interface + Gmail / mailto adapters
  ui/         screens and components
app/scripts/  template scrubber and the two verification harnesses
```

The Excel writer deliberately does **not** parse and re-serialise the workbook
with a library. It edits the raw XML of only the cells it owns, so the styling,
merges, logo drawing, printer settings and the *How To* sheet survive exactly as
the company built them.

### Growing this into a team platform

Storage and mail both sit behind interfaces (`store/adapter.ts`,
`mail/gmail.ts`). Adding team logins, shared invoice history, a manager-editable
rate card and automatic sending means writing two new adapter implementations
and one admin screen — the domain logic, the Excel writer and every screen stay
as they are.

---

## Known limitations

- **One line per task type.** The template has a fixed row per category and a
  fixed `SUM(J19:J47)`, so quantities are used rather than duplicated rows. Where
  a line covers several pieces of work, every link is listed in the cell and the
  first is made clickable — Excel allows only one hyperlink per cell.
- **Bank holidays are computed, not listed** — England & Wales only, and
  one-off holidays granted by royal proclamation must be added by hand to
  `EXTRA_HOLIDAYS` in `app/src/domain/bank-holidays.ts`.
- **History lives in one browser.** Clearing site data clears the list. The
  downloaded files are the real record.
