-- ---------------------------------------------------------------------------
-- JCEM invoicing — Phase B schema
--
-- Design notes that matter:
--
--  * Bank details are deliberately NOT stored here. They stay in the
--    freelancer's own browser and are injected when the file is generated.
--    See §1 of PLAN-PHASE-B.md — storing them makes JCEM the data controller
--    for financial data belonging to every freelancer, which is a business
--    decision that has not been taken.
--
--  * invoice_lines keeps its own unit_price and invoices pins a rate_card_id,
--    so a historical invoice always shows the price it was raised at, even
--    after rates change.
--
--  * template_row carries the workbook invariant into the database: unique per
--    invoice and within 19..47, because the template's subtotal is
--    SUM(J19:J47).
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

do $$ begin
  create type app_role as enum ('freelancer', 'manager', 'accounts', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum (
    'draft',
    'submitted',
    'changes_requested',
    'approved',
    'sent',
    'paid'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id             uuid primary key references auth.users on delete cascade,
  full_name      text not null default '',
  business_name  text not null default '',
  email          text not null default '',
  postal_address text not null default '',
  country        text not null default '',
  role           app_role not null default 'freelancer',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists rate_cards (
  id           uuid primary key default gen_random_uuid(),
  version      text not null unique,
  note         text,
  published_at timestamptz,
  published_by uuid references profiles(id),
  created_at   timestamptz not null default now()
);

create table if not exists rate_items (
  id           uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references rate_cards(id) on delete cascade,
  item_key     text not null,
  template_row int  not null check (template_row between 19 and 47),
  label        text not null,
  short        text not null,
  indent       smallint not null default 0 check (indent between 0 and 2),
  price        numeric(10, 2) not null check (price > 0),
  custom_price boolean not null default false,
  group_name   text not null,
  hint         text,
  unique (rate_card_id, item_key),
  unique (rate_card_id, template_row)
);

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  freelancer_id uuid not null references profiles(id) on delete cascade,
  number        int  not null,
  period_month  text not null check (period_month ~ '^\d{4}-\d{2}$'),
  issue_date    date not null,
  status        invoice_status not null default 'draft',
  rate_card_id  uuid references rate_cards(id),
  subtotal      numeric(10, 2) not null default 0,
  submitted_at  timestamptz,
  decided_at    timestamptz,
  decided_by    uuid references profiles(id),
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (freelancer_id, number)
);

create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_freelancer_idx on invoices (freelancer_id, period_month);

create table if not exists invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoices(id) on delete cascade,
  item_key     text not null,
  template_row int  not null check (template_row between 19 and 47),
  qty          int  not null check (qty > 0),
  unit_price   numeric(10, 2) not null check (unit_price >= 0),
  asana_links  text[] not null default '{}',
  page_links   text[] not null default '{}',
  unique (invoice_id, template_row)
);

create index if not exists invoice_lines_invoice_idx on invoice_lines (invoice_id);

-- One in-progress invoice per person, stored whole so a refresh loses nothing.
create table if not exists drafts (
  freelancer_id uuid primary key references profiles(id) on delete cascade,
  payload       jsonb not null,
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profile bootstrap
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Role lookup
--
-- SECURITY DEFINER so the policies on `profiles` do not recurse into
-- themselves when they ask what role the caller has.
-- ---------------------------------------------------------------------------

create or replace function current_role_of_user()
returns app_role
language sql
stable
security definer set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function is_staff()
returns boolean
language sql
stable
as $$
  select current_role_of_user() in ('manager', 'accounts', 'admin');
$$;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select current_role_of_user() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Invoice numbering
--
-- Numbering is per freelancer. Two tabs submitting at once must not claim the
-- same number, so the sequence is allocated under an advisory lock.
-- ---------------------------------------------------------------------------

create or replace function next_invoice_number()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  next_number int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select coalesce(max(number), 0) + 1
    into next_number
    from invoices
   where freelancer_id = auth.uid();

  return next_number;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table profiles      enable row level security;
alter table rate_cards    enable row level security;
alter table rate_items    enable row level security;
alter table invoices      enable row level security;
alter table invoice_lines enable row level security;
alter table drafts        enable row level security;

-- Profiles ------------------------------------------------------------------

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select using (id = auth.uid() or is_staff());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles
  for all using (is_admin()) with check (is_admin());

-- Only an admin may change someone's role, including their own.
create or replace function guard_role_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not is_admin() then
    raise exception 'only an admin may change a role';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on profiles;
create trigger profiles_guard_role
  before update on profiles
  for each row execute function guard_role_change();

-- Rate cards ----------------------------------------------------------------

drop policy if exists rate_cards_read on rate_cards;
create policy rate_cards_read on rate_cards
  for select using (published_at is not null or is_admin());

drop policy if exists rate_cards_admin on rate_cards;
create policy rate_cards_admin on rate_cards
  for all using (is_admin()) with check (is_admin());

drop policy if exists rate_items_read on rate_items;
create policy rate_items_read on rate_items
  for select using (
    exists (
      select 1 from rate_cards c
       where c.id = rate_items.rate_card_id
         and (c.published_at is not null or is_admin())
    )
  );

drop policy if exists rate_items_admin on rate_items;
create policy rate_items_admin on rate_items
  for all using (is_admin()) with check (is_admin());

-- Invoices ------------------------------------------------------------------

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices
  for select using (
    freelancer_id = auth.uid()
    or (current_role_of_user() in ('manager', 'admin') and status <> 'draft')
    or (current_role_of_user() = 'accounts' and status in ('approved', 'sent', 'paid'))
  );

drop policy if exists invoices_insert_own on invoices;
create policy invoices_insert_own on invoices
  for insert with check (freelancer_id = auth.uid());

-- A freelancer may only edit an invoice that is still theirs to change.
drop policy if exists invoices_update_own on invoices;
create policy invoices_update_own on invoices
  for update
  using (freelancer_id = auth.uid() and status in ('draft', 'changes_requested', 'submitted'))
  with check (freelancer_id = auth.uid());

drop policy if exists invoices_delete_own on invoices;
create policy invoices_delete_own on invoices
  for delete using (freelancer_id = auth.uid() and status in ('draft', 'changes_requested'));

drop policy if exists invoices_staff_update on invoices;
create policy invoices_staff_update on invoices
  for update using (is_staff()) with check (is_staff());

-- Invoice lines mirror their parent invoice ---------------------------------

drop policy if exists invoice_lines_select on invoice_lines;
create policy invoice_lines_select on invoice_lines
  for select using (
    exists (select 1 from invoices i where i.id = invoice_lines.invoice_id)
  );

drop policy if exists invoice_lines_write on invoice_lines;
create policy invoice_lines_write on invoice_lines
  for all
  using (
    exists (
      select 1 from invoices i
       where i.id = invoice_lines.invoice_id
         and i.freelancer_id = auth.uid()
         and i.status in ('draft', 'changes_requested', 'submitted')
    )
  )
  with check (
    exists (
      select 1 from invoices i
       where i.id = invoice_lines.invoice_id
         and i.freelancer_id = auth.uid()
    )
  );

-- Drafts --------------------------------------------------------------------

drop policy if exists drafts_own on drafts;
create policy drafts_own on drafts
  for all using (freelancer_id = auth.uid()) with check (freelancer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Status transitions
--
-- Enforced in the database so the rules cannot be bypassed by talking to the
-- API directly. The UI mirrors these, it does not define them.
-- ---------------------------------------------------------------------------

create or replace function guard_invoice_transition()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  actor_role app_role := current_role_of_user();
begin
  new.updated_at := now();

  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Freelancer submitting their own work.
  if old.status in ('draft', 'changes_requested') and new.status = 'submitted' then
    if old.freelancer_id <> auth.uid() then
      raise exception 'only the freelancer may submit their invoice';
    end if;
    new.submitted_at := now();
    return new;
  end if;

  -- Manager deciding.
  if old.status = 'submitted' and new.status in ('approved', 'changes_requested') then
    if actor_role not in ('manager', 'admin') then
      raise exception 'only a manager may approve or request changes';
    end if;
    new.decided_at := now();
    new.decided_by := auth.uid();
    return new;
  end if;

  -- Accounts progressing an approved invoice.
  if old.status = 'approved' and new.status = 'sent'
     or old.status = 'sent' and new.status = 'paid' then
    if actor_role not in ('accounts', 'admin') then
      raise exception 'only accounts may mark an invoice sent or paid';
    end if;
    return new;
  end if;

  raise exception 'invalid status change: % -> %', old.status, new.status;
end;
$$;

drop trigger if exists invoices_guard_transition on invoices;
create trigger invoices_guard_transition
  before update on invoices
  for each row execute function guard_invoice_transition();
