-- ═══════════════════════════════════════════════════════════════════════
-- Device names
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Two identical iPhones are indistinguishable to a browser -- Apple reports
-- no model, no serial, and Safari randomises the usual fingerprints on
-- purpose. They are already separate rows, because each device mints its
-- own random key; they simply both read "iPhone · Safari".
--
-- So this is a labelling problem, not an identification one. A short code
-- taken from the existing key separates them at a glance, and a name the
-- host types is what says WHOSE it is.
-- ═══════════════════════════════════════════════════════════════════════

alter table devices add column if not exists name text;

-- Admins may rename a device; a host may rename their own. Nobody can see
-- anyone else's, as before.
drop policy if exists devices_admin_revoke on devices;
create policy devices_admin_write on devices
  for update using (is_admin()) with check (is_admin());

comment on column devices.name is
  'Host-visible nickname, set by the admin. Cleared when a device is revoked.';
