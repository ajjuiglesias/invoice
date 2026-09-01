# Turning on team mode

The app runs in one of two modes, decided by whether two environment variables
are set.

| | **Personal** (default) | **Team** |
| --- | --- | --- |
| Accounts | None | Email-link sign-in |
| Storage | This browser only | Shared database |
| Invoice history | This browser only | Follows you between devices |
| Approval | By email | In-app queue for the line manager |
| Rate card | Compiled into the app | Admin-editable, versioned |
| Bank details | This browser only | **Still this browser only** |

Nothing is half-configured: with no credentials the app is exactly the Phase A
tool, and the Supabase client is never even downloaded.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a project.
   The free tier is enough.
2. Note the region — pick one in the UK or EU, since this will hold
   freelancers' names and addresses.

## 2. Create the schema

In the Supabase dashboard, open **SQL Editor** and run the contents of
[`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).

It creates the tables, the row-level security policies, the invoice-numbering
function, and the trigger that enforces the approval flow.

## 3. Point the app at it

In the dashboard go to **Settings → API** and copy the project URL and the
`anon` public key. Then, in `app/`:

```bash
cp .env.example .env.local
```

Fill both values in. The anon key is designed to be public — row-level security
is what protects the data, not the secrecy of that key. Never put the
`service_role` key in this file; it bypasses every policy.

Restart the dev server, or set the same two variables in your host's
environment (Vercel: Settings → Environment Variables; Netlify: Site
configuration → Environment variables) and redeploy.

## 4. Make yourself an admin

Everyone starts as `freelancer`. Sign in once so your profile row exists, then
in **SQL Editor**:

```sql
update profiles set role = 'admin' where email = 'you@example.com';
```

From then on the **Admin** tab lets you set everyone else's role without
touching SQL.

## 5. Set up email delivery

Supabase's built-in email sender is rate-limited and only really suitable for
testing. For real use, add an SMTP provider under
**Authentication → Email Templates → SMTP Settings**.

Sign-in links come from whatever address you configure there, so a
`@juliacharles.co.uk` sender needs the DNS records for that domain.

---

## Roles

| Role | Sees | Can do |
| --- | --- | --- |
| `freelancer` | Own invoices | Build, submit |
| `manager` | Everything submitted | Approve, request changes |
| `accounts` | Approved onwards | Mark sent, mark paid, see the Accounts view |
| `admin` | Everything | Everything, plus rates and roles |

The rules are enforced by row-level security and a database trigger, not by the
UI. Someone calling the API directly gets the same answer as someone clicking
buttons.

## The invoice lifecycle

```
draft ──submit──▶ submitted ──approve──▶ approved ──▶ sent ──▶ paid
                      │
                      └──request changes──▶ changes_requested ──▶ (edit, resubmit)
```

A submitted invoice is locked to its freelancer until a manager sends it back.

## Bank details

**Bank details are never uploaded.** They stay in `localStorage` on the
freelancer's own machine and are written only into the file they download.

This is deliberate — see §1 of [PLAN-PHASE-B.md](../PLAN-PHASE-B.md). Storing
them would make JCEM the data controller for financial data belonging to every
freelancer, with the retention and breach obligations that follow. That is a
business decision nobody has taken, so the code does not quietly take it.

The practical consequence: a freelancer moving to a new device re-enters their
bank details once. Everything else follows them.

## Changing rates

The **Admin** tab edits prices and publishes a new versioned rate card.
Invoices already raised keep the prices they were raised at, because each line
stores its own unit price.

Template rows are not editable. Each task type is pinned to a row in the
company workbook, whose subtotal is `SUM(J19:J47)` — changing that mapping
would break the generated spreadsheet, so the code refuses.

If no rate card has been published, the app uses the one compiled into
`app/src/domain/rate-card.ts`.

## Migrating existing users

The first time someone signs in, any profile and invoice history already in
that browser is copied up automatically, once. It never overwrites something
already in the cloud, and the local copy is left untouched.

## The Accounts view

Visible to `accounts` and `admin`. It answers the month-end questions:

- **What is owed** — three tiles: awaiting approval, approved but not sent, and
  sent but not paid, each with a count and a total.
- **By month** — every period with its status breakdown. Select one to scope
  the two panels below.
- **By freelancer** — who invoiced what for the selected month.
- **Not yet invoiced** — freelancers with nothing submitted for that month,
  which is the chase list.
- **Export CSV** — one row per invoice line, ready for a finance system. It is
  written UTF-8 with a byte-order mark so Excel reads the pound signs
  correctly, and commas in names are quoted properly.

The figures only ever cover invoices the signed-in person is allowed to see,
because they come through the same row-level security as everything else.

## What is not built yet

- **Automatic sending to accounts on approval** (B4 in the plan). Approved
  invoices still go by the existing Gmail hand-off. This needs a verified
  sending domain — see the DNS question in §1 of PLAN-PHASE-B.md.
