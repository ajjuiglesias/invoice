-- Invitation-only access, protected administration, and audit history.
begin;

create table if not exists user_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role app_role not null default 'freelancer',
  invited_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint user_invites_email_normalized check (email = lower(trim(email)))
);
create unique index if not exists user_invites_email_key on user_invites(email);
alter table user_invites enable row level security;
create policy user_invites_admin_read on user_invites for select to authenticated using (is_admin());

create table if not exists access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references profiles(id),
  target_user_id uuid references profiles(id),
  target_email text not null,
  action text not null check (action in ('invite_created','invite_revoked','role_changed','account_activated','account_deactivated')),
  old_role app_role,
  new_role app_role,
  created_at timestamptz not null default now()
);
create index if not exists access_audit_created_idx on access_audit(created_at desc);
alter table access_audit enable row level security;
create policy access_audit_admin_read on access_audit for select to authenticated using (is_admin());

-- Users may edit contact fields only. Role and active state are changed through audited RPCs.
revoke update on profiles from authenticated;
grant update(full_name,business_name,email,postal_address,country) on profiles to authenticated;
revoke insert, update, delete on user_invites, access_audit from anon, authenticated;
grant select on user_invites, access_audit to authenticated;

create or replace function check_invite(candidate_email text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from user_invites
    where email=lower(trim(candidate_email)) and accepted_at is null
  ) or exists(
    select 1 from profiles
    where email=lower(trim(candidate_email)) and active
  );
$$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
declare pending user_invites%rowtype;
begin
  select * into pending from user_invites
  where email=lower(trim(coalesce(new.email,''))) and accepted_at is null
  for update;

  insert into profiles(id,email,role,active)
  values(new.id,coalesce(new.email,''),coalesce(pending.role,'freelancer'),pending.id is not null)
  on conflict(id) do nothing;

  if pending.id is not null then
    update user_invites set accepted_at=now() where id=pending.id;
  end if;
  return new;
end;
$$;

create or replace function create_user_invite(candidate_email text, assigned_role app_role default 'freelancer', confirm_admin boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare normalized text:=lower(trim(candidate_email)); result uuid; existing profiles%rowtype;
begin
  if is_admin() is not true then raise exception 'Only an admin may invite users'; end if;
  if normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address'; end if;
  if assigned_role='admin' and confirm_admin is not true then raise exception 'Admin access requires confirmation'; end if;

  select * into existing from profiles where lower(email)=normalized for update;
  if found then
    if existing.active then raise exception 'This user already has access'; end if;
    update profiles set active=true, role=assigned_role where id=existing.id;
    insert into access_audit(actor_id,target_user_id,target_email,action,old_role,new_role)
    values(auth.uid(),existing.id,normalized,'account_activated',existing.role,assigned_role);
    return existing.id;
  end if;

  insert into user_invites(email,role,invited_by) values(normalized,assigned_role,auth.uid())
  on conflict(email) do update set role=excluded.role,invited_by=excluded.invited_by,created_at=now(),accepted_at=null
  returning id into result;
  insert into access_audit(actor_id,target_email,action,new_role) values(auth.uid(),normalized,'invite_created',assigned_role);
  return result;
end;
$$;

create or replace function revoke_user_invite(invite_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare target user_invites%rowtype;
begin
  if is_admin() is not true then raise exception 'Only an admin may revoke invitations'; end if;
  delete from user_invites where id=invite_id and accepted_at is null returning * into target;
  if not found then raise exception 'Pending invitation not found'; end if;
  insert into access_audit(actor_id,target_email,action,new_role) values(auth.uid(),target.email,'invite_revoked',target.role);
end;
$$;

create or replace function set_member_role(member_id uuid, assigned_role app_role, confirm_admin boolean default false) returns void
language plpgsql security definer set search_path=public as $$
declare target profiles%rowtype;
begin
  if is_admin() is not true then raise exception 'Only an admin may change roles'; end if;
  select * into target from profiles where id=member_id for update;
  if not found then raise exception 'Team member not found'; end if;
  if assigned_role='admin' and target.role<>'admin' and confirm_admin is not true then raise exception 'Admin access requires confirmation'; end if;
  if target.role=assigned_role then return; end if;
  if target.role='admin' and target.active and assigned_role<>'admin' and
    not exists(select 1 from profiles where id<>member_id and role='admin' and active) then
    raise exception 'The last active admin cannot be demoted';
  end if;
  update profiles set role=assigned_role where id=member_id;
  insert into access_audit(actor_id,target_user_id,target_email,action,old_role,new_role)
  values(auth.uid(),member_id,target.email,'role_changed',target.role,assigned_role);
end;
$$;

create or replace function set_member_active(member_id uuid, enabled boolean) returns void
language plpgsql security definer set search_path=public as $$
declare target profiles%rowtype;
begin
  if is_admin() is not true then raise exception 'Only an admin may change account access'; end if;
  select * into target from profiles where id=member_id for update;
  if not found then raise exception 'Team member not found'; end if;
  if target.active=enabled then return; end if;
  if target.role='admin' and target.active and not enabled and
    not exists(select 1 from profiles where id<>member_id and role='admin' and active) then
    raise exception 'The last active admin cannot be deactivated';
  end if;
  update profiles set active=enabled where id=member_id;
  insert into access_audit(actor_id,target_user_id,target_email,action,old_role,new_role)
  values(auth.uid(),member_id,target.email,case when enabled then 'account_activated' else 'account_deactivated' end,target.role,target.role);
end;
$$;

revoke all on function check_invite(text),create_user_invite(text,app_role,boolean),revoke_user_invite(uuid),
  set_member_role(uuid,app_role,boolean),set_member_active(uuid,boolean) from public,anon;
grant execute on function check_invite(text) to anon,authenticated;
grant execute on function create_user_invite(text,app_role,boolean),revoke_user_invite(uuid),
  set_member_role(uuid,app_role,boolean),set_member_active(uuid,boolean) to authenticated;

commit;
