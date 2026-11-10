-- v43 — applied 2026-11-06.
--
-- Suspension used to be a flag on a row: the app read it and chose to show a
-- locked screen. The credential still worked, so anyone calling the API
-- directly was unaffected. This makes it a real lock — sessions destroyed and
-- the login banned at the auth layer, so there is nothing left to honour.
create or replace function public.admin_set_suspended(p_host uuid, p_suspend boolean)
returns void language plpgsql security definer set search_path = public, auth as $fn$
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  if p_host = auth.uid() then raise exception 'you cannot suspend your own account'; end if;

  update public.hosts set suspended = p_suspend where id = p_host;

  if p_suspend then
    delete from auth.sessions where user_id = p_host;
    update auth.users set banned_until = now() + interval '100 years' where id = p_host;
  else
    update auth.users set banned_until = null where id = p_host;
  end if;
end $fn$;

revoke all on function public.admin_set_suspended(uuid, boolean) from public;
grant execute on function public.admin_set_suspended(uuid, boolean) to authenticated;

-- Also done in the Supabase dashboard on 2026-11-06:
--   Authentication → Sign In / Providers → "Allow new users to sign up" = OFF
-- The app has no signup UI, but the /auth/v1/signup endpoint was open to
-- anyone who read the page source for the project URL and key.
