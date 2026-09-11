-- Upgrade existing installations; run after 0001_init.sql.
begin;

alter table invoices add column if not exists profile_snapshot jsonb;
alter table invoices add column if not exists rate_card_version text not null default '2026-08';

create or replace function current_role_of_user() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active;
$$;

-- Numbers are reserved, not merely read. Gaps are intentional when a draft is abandoned.
create table if not exists invoice_counters (
  freelancer_id uuid primary key references profiles(id) on delete cascade,
  last_number integer not null
);
alter table invoice_counters enable row level security;
create or replace function next_invoice_number() returns int
language plpgsql security definer set search_path = public as $$
declare result integer;
begin
  if current_role_of_user() is null then raise exception 'Sign in with an active account'; end if;
  insert into invoice_counters values (auth.uid(),
    (select coalesce(max(number), 0) + 1 from invoices where freelancer_id = auth.uid()))
  on conflict (freelancer_id) do update set last_number = greatest(invoice_counters.last_number + 1,
    (select coalesce(max(number), 0) + 1 from invoices where freelancer_id = auth.uid()))
  returning last_number into result;
  return result;
end;
$$;

-- All content writes go through the atomic RPC; clients may only read tables.
revoke insert, update, delete on invoices, invoice_lines, rate_cards, rate_items from anon, authenticated;
grant select on invoices, invoice_lines, rate_cards, rate_items to authenticated;

drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select to authenticated using (
  current_role_of_user() is not null and
  (freelancer_id = auth.uid() or (is_staff() and status <> 'draft'))
);

create or replace function save_invoice(payload jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target uuid := (payload->>'id')::uuid;
  existing invoices%rowtype;
  item jsonb;
  snapshot jsonb := payload->'profile';
  card uuid;
begin
  if current_role_of_user() is null then raise exception 'Sign in with an active account'; end if;
  -- Serialize saves to the same invoice, including the first insert.
  perform pg_advisory_xact_lock(hashtext(target::text));
  select * into existing from invoices where id = target for update;
  if found and (existing.freelancer_id <> auth.uid() or existing.status not in ('draft','changes_requested')) then
    raise exception 'This invoice cannot be edited';
  end if;
  if jsonb_typeof(payload->'lines') is distinct from 'array' or jsonb_array_length(payload->'lines') not between 1 and 29 then
    raise exception 'Add between 1 and 29 invoice lines';
  end if;
  if (payload->>'number')::int <= 0 or payload->>'period_month' !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid invoice number or period';
  end if;
  -- Explicit allow-list: banking and arbitrary nested data never enter the snapshot.
  snapshot := jsonb_build_object('fullName',snapshot->>'fullName','businessName',snapshot->>'businessName',
    'email',snapshot->>'email','postalAddress',snapshot->>'postalAddress','country',snapshot->>'country');
  if coalesce(snapshot->>'fullName','') = '' or coalesce(snapshot->>'email','') = '' then
    raise exception 'Name and email are required';
  end if;
  select id into card from rate_cards where version = payload->>'rate_card_version' and published_at is not null;
  insert into invoices(id,freelancer_id,number,period_month,issue_date,profile_snapshot,rate_card_version,rate_card_id)
  values(target,auth.uid(),(payload->>'number')::int,payload->>'period_month',(payload->>'issue_date')::date,
    snapshot,coalesce(payload->>'rate_card_version','2026-08'),card)
  on conflict(id) do update set number=excluded.number, period_month=excluded.period_month,
    issue_date=excluded.issue_date, profile_snapshot=excluded.profile_snapshot,
    rate_card_version=excluded.rate_card_version,rate_card_id=excluded.rate_card_id;
  delete from invoice_lines where invoice_id=target;
  for item in select value from jsonb_array_elements(payload->'lines') loop
    if (item->>'unit_price')::numeric <= 0 or jsonb_array_length(item->'asana_links') = 0 or jsonb_array_length(item->'page_links') = 0 then
      raise exception 'Each line needs a positive price and work links';
    end if;
    insert into invoice_lines(invoice_id,item_key,template_row,qty,unit_price,asana_links,page_links)
    values(target,item->>'item_key',(item->>'template_row')::int,(item->>'qty')::int,(item->>'unit_price')::numeric,
      array(select jsonb_array_elements_text(item->'asana_links')),array(select jsonb_array_elements_text(item->'page_links')));
  end loop;
  update invoices set subtotal=(select sum(round(qty * unit_price,2)) from invoice_lines where invoice_id=target) where id=target;
  return target;
end;
$$;

create or replace function transition_invoice(target uuid, destination invoice_status, note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare inv invoices%rowtype; actor app_role := current_role_of_user();
begin
  if actor is null then raise exception 'Sign in with an active account'; end if;
  select * into inv from invoices where id=target for update;
  if not found then raise exception 'Invoice not found'; end if;
  if inv.status in ('draft','changes_requested') and destination='submitted' then
    if inv.freelancer_id <> auth.uid() then raise exception 'Only the owner can submit'; end if;
    if not exists(select 1 from invoice_lines where invoice_id=target) then raise exception 'Invoice has no lines'; end if;
  elsif inv.status='submitted' and destination in ('approved','changes_requested') then
    if actor not in ('manager','admin') or inv.freelancer_id=auth.uid() then raise exception 'An independent manager must review'; end if;
    if destination='changes_requested' and coalesce(trim(note),'')='' then raise exception 'Explain the requested changes'; end if;
  elsif (inv.status='approved' and destination='sent') or (inv.status='sent' and destination='paid') then
    if actor not in ('accounts','admin') then raise exception 'Only accounts can progress payment'; end if;
  else raise exception 'Invalid status transition';
  end if;
  update invoices set status=destination, decision_note=case when destination='submitted' then null else note end where id=target;
end;
$$;

create or replace function delete_invoice(target uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if current_role_of_user() is null then raise exception 'Sign in with an active account'; end if;
  delete from invoices where id=target and freelancer_id=auth.uid() and status in ('draft','changes_requested');
  if not found then raise exception 'This invoice cannot be deleted'; end if;
end;
$$;

create or replace function publish_rate_card(card_version text, items jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare card uuid; item jsonb;
begin
  if is_admin() is not true then raise exception 'Only an admin may publish rates'; end if;
  if jsonb_array_length(items) <> 29 then raise exception 'All 29 template rows are required'; end if;
  insert into rate_cards(version,published_at,published_by) values(card_version,now(),auth.uid()) returning id into card;
  for item in select value from jsonb_array_elements(items) loop
    insert into rate_items(rate_card_id,item_key,template_row,label,short,indent,price,custom_price,group_name,hint)
    values(card,item->>'id',(item->>'row')::int,item->>'label',item->>'short',(item->>'indent')::int,
      (item->>'price')::numeric,coalesce((item->>'customPrice')::boolean,false),item->>'group',item->>'hint');
  end loop;
end;
$$;

revoke all on function save_invoice(jsonb), transition_invoice(uuid,invoice_status,text), delete_invoice(uuid),
  publish_rate_card(text,jsonb), next_invoice_number() from public,anon;
grant execute on function save_invoice(jsonb), transition_invoice(uuid,invoice_status,text), delete_invoice(uuid),
  publish_rate_card(text,jsonb), next_invoice_number() to authenticated;
commit;
