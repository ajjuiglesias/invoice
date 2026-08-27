# JCEM Freelancer Invoice Generator — Build Plan

## 1. What the source files told us

### The template (`Invoice <Month> 2026 Ajju.xlsx`)
- Vertex42-derived workbook, 2 sheets: **`Invoice`** and **`How To`**.
- The embedded logo (`xl/media/image1.png`) is the **Vertex42 watermark**, not the JCEM logo.

**Cell map (sheet `Invoice`) — this is what the generator must fill:**

| Field | Cell |
|---|---|
| Invoice # | `H5` |
| Issue date | `J5` (Excel date serial) |
| Full name | `F10` |
| Business name | `F12` |
| Email address | `F13` |
| Postal address | `F14` |
| Country | `F15` |
| Bank – account name | `J9` |
| Bank – bank name | `J10` |
| Bank – sort code | `J11` |
| Bank – account number | `J12` |
| IBAN (overseas) | `J14` |
| BIC/SWIFT (overseas) | `J15` |
| Currency (overseas) | `J16` |
| Line items | rows `19`–`47` |
| Subtotal | `J48` = `SUM(J19:J47)` |

**Line-item columns:** `A`/`B`/`C` description (3 indent levels) · `F` Asana task link · `G` URL page link · `H` QTY · `I` unit price · `J` amount, formula `=IF(H19="",ROUND(1*I19,2),ROUND(H19*I19,2))`.

### Rate card (24 categories, extracted from the July sheet)

| # | Task type | £ |
|---|---|---|
| 1 | New Act End Page | 35 |
| 1a | └ Additional Section | 5 |
| 2 | Act End Page Updates (Complete Refresh) | 35 |
| 3 | Quick Edits | 35 |
| 3a | └ 3–5 edits | 15 |
| 3b | └ 6–8 edits | 25 |
| 3c | └ 8–10 edits | 30 |
| 4 | New Blog | 80 |
| 5 | Blog Update (Full Refresh) | 40 |
| 6 | Blog Edit | 25 *(July)* / 20 *(August)* — **needs confirming** |
| 7 | Multi-Image Post (Carousel) | 10 |
| 8 | Text & Image Carousel | 15 |
| 9 | PDF / Collage Carousel | 20 |
| 10 | Expanded Carousel | 28 |
| 11 | Artist / Job Call outs | 15 |
| 12 | Article Posts | 15 |
| 13 | Concept of 3 (Instagram) | 40 |
| 14 | Basic Video (socials) | 20 |
| 15 | Intermediate Video (Socials) | 30 |
| 16 | BTS / Moment Clips — 1 clip | 10 |
| 16a | └ 3–5 clips | 25 |
| 17 | Grid / GIF Style Video | 20 |
| 18 | Intermediate Video (YouTube/Website) | 50 |
| 19 | Advanced Video (YouTube/Website) | 80 |
| 20 | New Event / Service Page | 80 |
| 21 | Update Event / Service Page | 40 |
| 22 | Edit Event / Service Page | 25 |
| 23 | Pinterest 5 Pins | 15 |
| 24 | Adhoc | user-entered price |

### Company rules (from the `How To` sheet) — encode these as validation
- Monthly invoicing only; **approved and published content only**.
- Every line **must** carry both an Asana task link and a live page URL.
- Only sign-off-and-published items may be invoiced.
- Must reach the line manager **≥ 5 working days before the last day of the month**.
- To: `kim@juliacharles.co.uk` · CC: `accounts@juliacharles.co.uk`

### Brand (from the guidelines deck)
| Role | Hex |
|---|---|
| Primary teal | `#0FABAC` |
| Secondary charcoal | `#35383F` |
| Secondary charcoal (alt) | `#3C4147` |
| CTA / highlight red | `#EF3340` |
| White | `#FFFFFF` |

**Type:** H1/H2 → *JCEM Semibold* (custom; fall back to Open Sans SemiBold). H3 + body → **Open Sans**.
**Logo rules:** white-text version on charcoal, charcoal version on white; never crowd it; "EVENT MANAGEMENT" must always stay legible.

---

## 2. Proposed system

**Decision: ship Phase A (no backend), architected to become Phase B (full platform) later.**

### Phase A — what we build now
A single-page app deployed to a URL (Vercel/Netlify, free). Everything runs in the browser:
- **No server, no database, no accounts.** The freelancer's profile and bank details are saved in `localStorage` on their own machine, so they type them once.
- Rate card lives in one versioned config file (`rate-card.ts`) that you update and redeploy.
- Files are generated **client-side** and downloaded.

### Phase B — the upgrade path (only if the company likes it)
Supabase drops in behind the same UI: team logins, shared invoice history, a manager admin screen for editing rates, and server-side email. **Nothing in Phase A gets thrown away** — see the seam below.

### The seam that makes B cheap
Everything is written as pure modules with one swappable adapter:

```
domain/          rate-card.ts, invoice model, totals, validation   (unchanged in B)
export/          xlsx-writer.ts, pdf-render.ts                     (unchanged in B)
store/           StorageAdapter interface
                   └ LocalStorageAdapter   ← Phase A
                   └ SupabaseAdapter       ← Phase B, drop-in
mail/            MailAdapter interface
                   └ GmailComposeAdapter   ← Phase A
                   └ ResendAdapter         ← Phase B, drop-in
ui/              screens (unchanged in B, plus an admin route)
```
Phase B is then: add auth, write two adapter files, add one admin screen. No rewrite.

### Screens (Phase A)
1. **My details** — name, business, email, postal address, country, bank details. Saved locally, entered once.
2. **Build invoice**
   - Month picker → issue date; invoice number auto-increments from the last one stored locally.
   - Searchable picker of the 24 task categories with their sub-tiers; click to add a line.
   - Each line: qty, unit price (locked except Adhoc), **Asana link**, **live page link**.
   - Running subtotal in brand teal.
   - Inline validation: missing links, zero qty, Adhoc with no price, duplicate Asana links, non-JCEM URLs.
3. **Preview & send** — branded A4 preview, then Download XLSX · Download PDF · Open email.

### Outputs
- **Filled `.xlsx`** — generated in-browser by loading the real template as a static asset, unzipping it with JSZip and surgically editing `xl/worksheets/sheet1.xml`. Every formula, style, column width and the `How To` sheet survive **byte-identical**; only the cells we target change. More faithful than any library re-write of the workbook.
- **Branded PDF** — A4 print stylesheet in JCEM colours with the real logo, Open Sans, clickable Asana/URL links; produced via the browser's Save-as-PDF so the text stays vector-crisp.
- **Email** — opens a pre-filled Gmail compose window: To `kim@juliacharles.co.uk`, CC `accounts@juliacharles.co.uk`, branded subject and body, sent **from the freelancer's own address**. They attach the two downloaded files. Zero infrastructure; becomes one-click automatic in Phase B.

---

## 3. Build phases

| Phase | Deliverable |
|---|---|
| **A0. Foundations** | Project scaffold, Tailwind theme locked to brand tokens, Open Sans loaded, logo assets prepared, `rate-card.ts` as single source of truth, adapter interfaces defined. |
| **A1. Excel writer** | Browser-side JSZip/OOXML writer. Verified by regenerating the real August invoice and diffing against the original. |
| **A2. Invoice builder UI** | Details screen, task picker, line editor, live totals, validation. |
| **A3. Branded PDF** | A4 brand-matched render, print-perfect. |
| **A4. Email handoff** | Gmail compose link, branded body, 5-working-day deadline warning. |
| **A5. Deploy** | Live URL + a one-page usage guide for the team. |
| **B1–B3.** *(later, if adopted)* | Supabase auth + shared history · manager admin rate-card editor · automatic email send. |

---

## 4. Assumptions I'm proceeding on (say the word to change any)
- **Outputs:** both the filled XLSX *and* the branded PDF.
- **Email:** Gmail compose handoff in Phase A.
- **Logo:** cropped from the brand deck at best available resolution; swapped instantly if you supply a PNG/SVG.
- **Blog Edit:** £25 (the July figure), and editable in the config.
- **Invoice numbering:** per-freelancer, continuing your own sequence (yours is at #3).
- **IBAN / BIC / Currency:** left blank unless filled in on the details screen.

## 5. Still worth a quick answer
1. **Blog Edit — £25 or £20?** July says 25, August says 20.
2. Do you have the **official logo file**, or shall I crop from the deck?
3. Any other freelancers' **rate cards differ from yours**, or is this one card for everyone?
