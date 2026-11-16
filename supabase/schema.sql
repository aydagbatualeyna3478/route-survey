-- Route Survey: accounts, device approval and access log.
-- Run once in the Supabase SQL editor (safe to re-run).

create table if not exists public.admin_emails (email text primary key);
insert into public.admin_emails(email) values ('aydagbatualeyna@gmail.com'), ('omercan130@gmail.com') on conflict do nothing;

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id text not null,
  user_id uuid not null references public.profiles on delete cascade,
  label text not null default '',
  platform text not null default '',
  approved boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  primary key (id, user_id)
);

create table if not exists public.access_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  email text,
  device_id text,
  device_label text,
  event text not null,
  detail text not null default ''
);
create index if not exists access_log_at on public.access_log (at desc);

alter table public.admin_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.access_log enable row level security;

-- admin = active admin profile, signed in with the authenticator code (aal2)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists log_read on public.access_log;
create policy log_read on public.access_log for select to authenticated using (public.is_admin());
-- no insert/update/delete policies: all writes go through the functions below or the admin edge function

-- every new account gets a profile; the listed emails become admins
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, full_name, role)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          case when exists (select 1 from admin_emails where email = lower(new.email)) then 'admin' else 'user' end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- accounts created before this script
insert into public.profiles (id, email, role)
select u.id, lower(u.email), case when exists (select 1 from public.admin_emails a where a.email = lower(u.email)) then 'admin' else 'user' end
from auth.users u on conflict (id) do nothing;

-- the app calls this on every sign-in / start / periodic check
create or replace function public.check_in(p_device text, p_label text default '', p_platform text default '', p_event text default 'check')
returns json language plpgsql security definer set search_path = public as $$
declare
  p profiles; d devices; first_admin boolean; is_new boolean := false; ok boolean;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then return json_build_object('ok', false, 'active', false, 'reason', 'no_profile'); end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then return json_build_object('ok', false, 'active', p.active, 'reason', 'mfa'); end if;
  if length(coalesce(p_device, '')) < 16 then raise exception 'invalid device id'; end if;
  select * into d from devices where id = p_device and user_id = p.id;
  if d.id is null then
    is_new := true;
    -- an admin's very first device is approved automatically (otherwise nobody could approve anything)
    first_admin := p.role = 'admin' and not exists (select 1 from devices where user_id = p.id);
    insert into devices (id, user_id, label, platform, approved, approved_by, approved_at, last_seen)
    values (p_device, p.id, left(coalesce(p_label, ''), 80), left(coalesce(p_platform, ''), 40), first_admin,
            case when first_admin then p.id end, case when first_admin then now() end, now())
    returning * into d;
  else
    update devices set last_seen = now(), platform = left(coalesce(p_platform, platform), 40),
      label = case when p_label <> '' and (label = '' or label = platform) then left(p_label, 80) else label end
    where id = p_device and user_id = p.id returning * into d;
  end if;
  ok := p.active and d.approved;
  if p_event = 'login' or is_new or not ok then
    insert into access_log (user_id, email, device_id, device_label, event, detail)
    values (p.id, p.email, d.id, coalesce(nullif(d.label, ''), d.platform),
            case when not p.active then 'blocked' when not d.approved then 'pending' else p_event end,
            case when not p.active then 'kullanıcı kapalı' when not d.approved then 'cihaz onaysız' else '' end);
  end if;
  return json_build_object('ok', ok, 'active', p.active, 'approved', d.approved, 'role', p.role, 'name', p.full_name, 'email', p.email);
end $$;

-- admin: approve a device, or remove it (reject / revoke)
create or replace function public.admin_device(p_device text, p_user uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d devices; me profiles;
begin
  if not public.is_admin() then raise exception 'not allowed'; end if;
  select * into me from profiles where id = auth.uid();
  select * into d from devices where id = p_device and user_id = p_user;
  if d.id is null then return; end if;
  if p_approve then
    update devices set approved = true, approved_by = me.id, approved_at = now() where id = p_device and user_id = p_user;
  else
    delete from devices where id = p_device and user_id = p_user;
  end if;
  insert into access_log (user_id, email, device_id, device_label, event, detail)
  values (p_user, (select email from profiles where id = p_user), p_device, coalesce(nullif(d.label, ''), d.platform),
          case when p_approve then 'device_approved' else 'device_removed' end, 'admin: ' || me.email);
end $$;

revoke all on function public.check_in(text, text, text, text) from public, anon;
revoke all on function public.admin_device(text, uuid, boolean) from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.check_in(text, text, text, text) to authenticated;
grant execute on function public.admin_device(text, uuid, boolean) to authenticated;
grant execute on function public.is_admin() to authenticated;
revoke all on public.admin_emails from anon, authenticated;
grant select on public.profiles, public.devices, public.access_log to authenticated;
revoke insert, update, delete on public.profiles, public.devices, public.access_log from anon, authenticated;
