-- Safe administration of published rate-card versions.
begin;

create or replace function delete_rate_card(card_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare target rate_cards%rowtype; active_id uuid;
begin
  if is_admin() is not true then raise exception 'Only an admin may delete rate cards'; end if;
  select * into target from rate_cards where id=card_id for update;
  if not found then raise exception 'Rate card not found'; end if;
  select id into active_id from rate_cards where published_at is not null order by published_at desc limit 1;
  if target.id=active_id then raise exception 'The active rate card cannot be deleted. Publish another version first'; end if;
  if exists(select 1 from invoices where rate_card_id=card_id) then
    raise exception 'This rate card is used by an invoice and must be kept for history';
  end if;
  if (select count(*) from rate_cards where published_at is not null) <= 1 then
    raise exception 'The last published rate card cannot be deleted';
  end if;
  delete from rate_cards where id=card_id;
end;
$$;

revoke all on function delete_rate_card(uuid) from public,anon;
grant execute on function delete_rate_card(uuid) to authenticated;
commit;
