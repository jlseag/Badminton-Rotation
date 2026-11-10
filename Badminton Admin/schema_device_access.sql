-- v42 — run against Supabase on 2026-11-06. Already applied.
--
-- 1. Which session this device is signed in on, so access can be removed for
--    ONE device without touching the host's others.
alter table public.devices add column if not exists session_id uuid;

-- 2. A name belongs to the device, not to the row. One physical device has one
--    row per account it has signed into; a row born on a new account inherits
--    the name the device already carries elsewhere.
create or replace function public.devices_inherit_name()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  if new.name is null then
    select d.name into new.name
      from public.devices d
     where d.device_key = new.device_key and d.name is not null
     order by d.last_seen desc nulls last
     limit 1;
  end if;
  return new;
end $fn$;

drop trigger if exists devices_inherit_name_t on public.devices;
create trigger devices_inherit_name_t
  before insert on public.devices
  for each row execute function public.devices_inherit_name();

-- 3. Remove access. Deleting the session kills its refresh tokens too
--    (refresh_tokens.session_id references auth.sessions(id) ON DELETE CASCADE),
--    so the device cannot renew itself. A plain revoked=true was only ever a
--    note to ourselves -- the app never read it.
create or replace function public.admin_remove_device_access(p_device uuid)
returns void language plpgsql security definer set search_path = public, auth as $fn$
declare sid uuid;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  select session_id into sid from public.devices where id = p_device;
  update public.devices set revoked = true where id = p_device;
  if sid is not null then delete from auth.sessions where id = sid; end if;
end $fn$;

revoke all on function public.admin_remove_device_access(uuid) from public;
grant execute on function public.admin_remove_device_access(uuid) to authenticated;
