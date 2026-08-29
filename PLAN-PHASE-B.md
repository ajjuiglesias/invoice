# Phase B — from personal tool to team platform

Phase A shipped: a no-backend app where each freelancer builds their invoice,
downloads the filled template and a branded PDF, and emails them to their line
manager. This plan takes it to the target originally agreed — **logins, shared
invoice history, in-app approval, an admin-editable rate card and automatic
sending**.

---

## 1. Decide this first

### Will JCEM store freelancers' bank details?

Today, sort codes and account numbers **never leave the freelancer's own
machine** — they live in that browser and are written only into the file they
download. That is why Phase A needed no data-protection conversation.

A hosted database changes that completely. JCEM becomes the data controller for
financial data belonging to every freelancer, with the retention, access-control
and breach obligations that follow. This is a business decision, not a technical
one, and it should be made before any schema is written.

Three workable answers:

| Option | What it means | Trade-off |
| --- | --- | --- |
| **A. Keep bank details local** *(recommended to start)* | Everything else moves to the database; bank details stay in `localStorage` and are injected when the file is generated. | Zero new obligation. Freelancers re-enter them on a new device. |
| **B. Store encrypted** | Held in Postgres, encrypted at rest with a key outside the database; only the freelancer and accounts can decrypt. | Full convenience. Needs a retention policy, a documented lawful basis, and key management. |
| **C. Store plainly, restricted by RLS** | Simplest to build. | Weakest position if there is ever a breach. Not recommended. |

**Recommendation: A for B1–B3, revisit at B4** when accounts genuinely needs
them server-side. It keeps the risky decision out of the critical path.

### Other answers needed from JCEM

1. Who are the **line managers**, and does anyone other than Kim approve?
2. Does **accounts** want a login, or just the email they get today?
3. Can JCEM add **DNS records for `juliacharles.co.uk`** so the system can send
   email as a real company address? Without it, automatic sending goes out from
   a generic domain and will look like spam.
4. **Blog Edit — £25 or £20?** Still unresolved from Phase A, and it becomes
   harder to change once historical invoices reference a stored rate card.
5. Should **`3) Quick Edits` at £35** be invoiceable at all, given it sits above
   its own £15 / £25 / £30 tiers?

---

## 2. Stack

**Keep the existing Vite + React app. Add Supabase behind it.**

Not Next.js. There is no SEO or server-rendering requirement, and the app was
deliberately built against two interfaces so the backend could be swapped
without touching the UI. Migrating framework would be a rewrite that buys
nothing.

Supabase gives, on one free tier: Postgres, authentication, row-level security,
file storage and Edge Functions — which is the entire list of what Phase B
needs.

### What already fits

| Seam | Status |
| --- | --- |
| `store/adapter.ts` — 8 methods | `SupabaseAdapter` implements the same interface. UI unchanged. |
| `mail/gmail.ts` — `MailAdapter` | `ResendAdapter` implements `deliver()`. |
| `domain/` — rate card, totals, dates, validation | Pure. Unchanged, and its 54 tests keep passing. |
| `export/buildXlsx`, `export/buildPdf` | **Already proven to run outside a browser** — both verification harnesses render them in Node. Server-side generation needs no rewrite. |

The genuinely new work is authentication, roles, the approval workflow, and
moving the rate card out of code.

---

## 3. Data model

```
profiles            id → auth.users, full_name, business_name, email,
                    postal_address, country, role, active
rate_cards          id, version, effective_from, published_by, published_at
rate_items          rate_card_id, item_key, template_row, label, short, indent,
                    price, custom_price, group_name, hint
invoices            id, freelancer_id, number, period_month, issue_date,
                    status, rate_card_id, subtotal, submitted_at,
                    decided_at, decided_by, decision_note
invoice_lines       invoice_id, item_key, qty, unit_price,
                    asana_links[], page_links[]
invoice_files       invoice_id, kind (xlsx|pdf), storage_path, generated_at
```

`invoice_lines` stores `unit_price` per line, and `invoices` pins
`rate_card_id`. Together those mean **a historical invoice always shows the
price it was raised at**, even after rates change — the same guarantee
`RATE_CARD_VERSION` gives today.

`template_row` stays on `rate_items` and keeps its invariant: unique, and within
19–47, because the workbook's subtotal is `SUM(J19:J47)`. The admin screen must
enforce this — the existing writer already refuses to run if it breaks.

### Status flow

```
draft ──submit──▶ submitted ──approve──▶ approved ──send──▶ sent_to_accounts ──▶ paid
                      │
                      └──request changes──▶ changes_requested ──▶ (back to draft)
```

### Roles and access

| Role | Can see | Can do |
| --- | --- | --- |
| `freelancer` | Own invoices only | Create, edit own drafts, submit |
| `manager` | All submitted invoices | Approve, request changes |
| `accounts` | Approved invoices | Mark sent / paid, export |
| `admin` | Everything | Manage the rate card and people |

Enforced with Postgres row-level security, so the rules live in the database
rather than in the UI, where they could be bypassed.

### Invoice numbering

Today numbering is per-freelancer and derived from local history. Shared storage
makes that racy. Replace with a Postgres function that allocates the next number
per freelancer inside a transaction, so two tabs cannot claim the same one.

---

## 4. Delivery phases

Each phase is shippable on its own and leaves the app working.

### B1 — Accounts and sync
Supabase project, email-link login, `profiles`, `SupabaseAdapter`, RLS for
"own rows only". Migrate existing `localStorage` data on first login so nobody
loses their history. Bank details stay local (decision A above).

*Outcome: the same app, but your invoices follow you between devices.*

### B2 — Submission and approval
`status` on invoices, a **Submit** action replacing the download-and-email
dance, and a manager queue: the invoice preview, its Asana and page links, and
Approve / Request changes with a note. Freelancers see the decision.

*Outcome: Kim stops approving by email. This is the phase that changes how the
company works, and the one to build carefully.*

### B3 — Admin rate card
Rates move from `rate-card.ts` into `rate_cards` / `rate_items`, edited in-app
by an admin. Publishing creates a new version rather than mutating the old one.
`rate-card.ts` becomes the seed for the first version.

*Outcome: Kim changes a price without a developer.*

### B4 — Automatic sending and stored files
On approval, generate the XLSX and PDF, store them in Supabase Storage, and
email accounts via an Edge Function and Resend. **Depends on the DNS answer in
§1.** Until then, keep the Gmail hand-off — it already works.

*Outcome: approved invoices reach accounts with no manual attaching.*

### B5 — Accounts view
Monthly totals, who has not invoiced yet, outstanding approvals, CSV export.

*Outcome: accounts stop chasing.*

---

## 5. What carries over unchanged

- The whole `domain/` layer and its 54 tests.
- The Excel writer and its 83-check harness — **the single most important thing
  not to disturb.** It stays byte-faithful to the company template whether it
  runs in a browser or on a server.
- The PDF renderer and its 9 checks.
- Every screen. `App.tsx` swaps one adapter construction; the screens take the
  same props.

## 6. Risks

| Risk | Handling |
| --- | --- |
| Storing bank details creates a data-protection obligation | Decision A defers it entirely until B4 |
| No verified sending domain | B4 blocked; Gmail hand-off stays as fallback |
| Admin edits break the `SUM(J19:J47)` invariant | Validate on save; the writer already refuses bad input |
| Rate change silently rewrites historical invoices | Versioned rate cards, prices pinned per line |
| The team never adopts it | B1 and B2 are the adoption test — do not build B3–B5 until Kim is actually approving in-app |
| Excel compatibility still unproven by a real Excel | Open a generated file and send it to Kim **before** any of this |

---

## 7. Before starting

**Phase A is not finished being proven.** No copy of Excel has opened a
generated workbook yet, and the app is not deployed anywhere. Both should be
true before building on top:

1. Open a generated `.xlsx` in Excel and send one to Kim as a live test.
2. Deploy Phase A — `netlify.toml` and `app/vercel.json` are already in place.
3. Let one real month go through it.

That month of real use is what tells you whether B2's approval flow should look
the way this plan assumes.
