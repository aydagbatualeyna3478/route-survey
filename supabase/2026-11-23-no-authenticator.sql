-- 23.11.2026 · Authenticator (iki adımlı doğrulama) kaldırıldı.
-- Giriş: e-posta + şifre. Yöneticilerin (role = admin) cihazları onay beklemez;
-- diğer kullanıcıların her yeni cihazı bir kez yönetici onayından geçer, sonrası onaysız.
-- Supabase → SQL Editor'da bir kez çalıştırılır (tekrar çalıştırmak zararsız).

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

create or replace function public.check_in(p_device text, p_label text default '', p_platform text default '', p_event text default 'check')
returns json language plpgsql security definer set search_path = public as $$
declare
  p profiles; d devices; adm boolean; is_new boolean := false; ok boolean;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then return json_build_object('ok', false, 'active', false, 'reason', 'no_profile'); end if;
  if length(coalesce(p_device, '')) < 16 then raise exception 'invalid device id'; end if;
  adm := p.role = 'admin';
  select * into d from devices where id = p_device and user_id = p.id;
  if d.id is null then
    is_new := true;
    -- an admin's devices are approved automatically; everyone else waits for an admin once per device
    insert into devices (id, user_id, label, platform, approved, approved_by, approved_at, last_seen)
    values (p_device, p.id, left(coalesce(p_label, ''), 80), left(coalesce(p_platform, ''), 40), adm,
            case when adm then p.id end, case when adm then now() end, now())
    returning * into d;
  else
    update devices set last_seen = now(), platform = left(coalesce(p_platform, platform), 40),
      label = case when p_label <> '' and (label = '' or label = platform) then left(p_label, 80) else label end,
      approved = approved or adm,
      approved_by = case when not approved and adm then p.id else approved_by end,
      approved_at = case when not approved and adm then now() else approved_at end
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

-- admins' devices that were still waiting: approve
update public.devices d set approved = true, approved_by = d.user_id, approved_at = now()
where not d.approved and exists (select 1 from public.profiles p where p.id = d.user_id and p.role = 'admin');

-- remove the old authenticator links of every account (otherwise password changes could ask for the code)
delete from auth.mfa_factors;
