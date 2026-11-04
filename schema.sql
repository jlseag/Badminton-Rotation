-- ═══════════════════════════════════════════════════════════════════════════
-- Badminton Rotation — database schema
-- Paste the whole file into Supabase → SQL Editor → New Query → Run.
-- Safe to re-run: every statement is idempotent.
--
-- The point of this file: the free/paid boundary is enforced HERE, by the
-- database, not by JavaScript on the phone. A host cannot lift their own
-- limits by editing the app, forking the repo, or calling the API directly.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tunable limits ───────────────────────────────────────────────────────
-- Free tier caps, and how long the app may trust a cached "this host is paid"
-- answer while offline. Changing a value here changes behaviour immediately,
-- with no app release.
create table if not exists config (
  key    text primary key,
  value  int not null,
  note   text
);
insert into config (key, value, note) values
  ('free_max_players', 8,  'Players allowed in one group on the free tier'),
  ('free_max_courts',  1,  'Courts allowed per session on the free tier'),
  ('trial_days',      14,  'Length of the free trial'),
  ('offline_grace_days', 14, 'How long the app trusts a cached entitlement offline')
on conflict (key) do nothing;

create or replace function cfg(k text) returns int
language sql stable as $$ select value from config where key = k $$;

-- ─── Hosts ────────────────────────────────────────────────────────────────
-- One row per person who signs in. Players are NOT users; they are names on
-- a host's roster. Only hosts have accounts.
create table if not exists hosts (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

-- ─── Entitlements ─────────────────────────────────────────────────────────
-- The paywall's source of truth. Deliberately NOT writable by the host:
-- only the service role (payment webhooks, admin) may change it. If a host
-- could update this row, everything else in this file would be decorative.
do $$ begin
  create type plan_status as enum ('free','trial','active','lapsed');
exception when duplicate_object then null; end $$;

create table if not exists entitlements (
  host_id    uuid primary key references hosts(id) on delete cascade,
  status     plan_status not null default 'free',
  expires_at timestamptz,                        -- trial end, or paid period end
  source     text,                               -- 'manual' | 'midtrans' | 'apple' | 'google'
  updated_at timestamptz not null default now()
);

-- Premium = on trial or paid, and not yet expired. Used by every policy below.
create or replace function is_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from entitlements e
    where e.host_id = uid
      and e.status in ('trial','active')
      and (e.expires_at is null or e.expires_at > now())
  );
$$;

-- New sign-up: create the host row and start the trial automatically.
create or replace function handle_new_host() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into hosts (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;

  insert into entitlements (host_id, status, expires_at, source)
  values (new.id, 'trial', now() + (cfg('trial_days') || ' days')::interval, 'signup')
  on conflict (host_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_host();

-- ─── Groups ───────────────────────────────────────────────────────────────
-- A recurring mabar group: "Saturday Senayan". Premium hosts may have many;
-- free hosts get one.
create table if not exists groups (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references hosts(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists groups_host_idx on groups(host_id);

-- ─── Players ──────────────────────────────────────────────────────────────
-- The saved roster. tier drives matchmaking; order within a tier is the
-- skill order the host arranged by dragging.
do $$ begin
  create type skill_tier as enum ('adv','upp','int','beg');
exception when duplicate_object then null; end $$;

create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  name       text not null,
  tier       skill_tier not null default 'int',
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists players_group_idx on players(group_id);

-- ─── Sessions ─────────────────────────────────────────────────────────────
-- One evening of play. settings holds the scoring mode, target, match style
-- and matchmaking weights exactly as the app stores them.
create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  host_id    uuid not null references hosts(id) on delete cascade,
  courts     int not null default 1,
  settings   jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sessions_group_idx on sessions(group_id, started_at desc);
create index if not exists sessions_host_idx  on sessions(host_id, started_at desc);

-- ─── Rounds and matches ───────────────────────────────────────────────────
-- Normalised rather than JSON, so season standings are plain SQL.
create table if not exists rounds (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round_no   int not null,
  resting    uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (session_id, round_no)
);

create table if not exists matches (
  id          uuid primary key default gen_random_uuid(),
  round_id    uuid not null references rounds(id) on delete cascade,
  court_no    int not null,
  team_a      uuid[] not null,                   -- two player ids
  team_b      uuid[] not null,
  winner      char(1) check (winner in ('a','b')),
  win_score   int,
  lose_score  int,
  created_at  timestamptz not null default now(),
  unique (round_id, court_no)
);
create index if not exists matches_round_idx on matches(round_id);

-- ─── Locked partners ──────────────────────────────────────────────────────
create table if not exists locked_pairs (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid not null references groups(id) on delete cascade,
  player_a  uuid not null references players(id) on delete cascade,
  player_b  uuid not null references players(id) on delete cascade,
  check (player_a <> player_b)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Ownership helpers
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function owns_group(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups where id = g and host_id = auth.uid());
$$;

create or replace function owns_session(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sessions where id = s and host_id = auth.uid());
$$;

create or replace function owns_round(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds rd join sessions s on s.id = rd.session_id
    where rd.id = r and s.host_id = auth.uid());
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Row level security — a host sees only their own data, and the free caps
-- are checked on write. This is the paywall.
-- ═══════════════════════════════════════════════════════════════════════════
alter table hosts        enable row level security;
alter table entitlements enable row level security;
alter table groups       enable row level security;
alter table players      enable row level security;
alter table sessions     enable row level security;
alter table rounds       enable row level security;
alter table matches      enable row level security;
alter table locked_pairs enable row level security;
alter table config       enable row level security;

drop policy if exists hosts_self on hosts;
create policy hosts_self on hosts
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Read your own entitlement. Nobody may write it except the service role,
-- which bypasses RLS entirely. No insert/update/delete policy exists on
-- purpose — absence of a policy means denied.
drop policy if exists entitlements_read on entitlements;
create policy entitlements_read on entitlements
  for select using (host_id = auth.uid());

-- Limits are public knowledge; the app shows them in the paywall copy.
drop policy if exists config_read on config;
create policy config_read on config for select using (true);

-- Groups: free hosts get exactly one.
drop policy if exists groups_rw on groups;
create policy groups_rw on groups
  for select using (host_id = auth.uid());
drop policy if exists groups_insert on groups;
create policy groups_insert on groups
  for insert with check (
    host_id = auth.uid()
    and (
      is_premium(auth.uid())
      or (select count(*) from groups g where g.host_id = auth.uid()) < 1
    )
  );
drop policy if exists groups_update on groups;
create policy groups_update on groups
  for update using (host_id = auth.uid()) with check (host_id = auth.uid());
drop policy if exists groups_delete on groups;
create policy groups_delete on groups for delete using (host_id = auth.uid());

-- Players: THE cap. A free host cannot store a 9th player, however they ask.
drop policy if exists players_read on players;
create policy players_read on players for select using (owns_group(group_id));
drop policy if exists players_insert on players;
create policy players_insert on players
  for insert with check (
    owns_group(group_id)
    and (
      is_premium(auth.uid())
      or (select count(*) from players p
          where p.group_id = players.group_id and p.active) < cfg('free_max_players')
    )
  );
drop policy if exists players_update on players;
create policy players_update on players
  for update using (owns_group(group_id)) with check (owns_group(group_id));
drop policy if exists players_delete on players;
create policy players_delete on players for delete using (owns_group(group_id));

-- Sessions: free hosts get one court, and one session at a time.
drop policy if exists sessions_read on sessions;
create policy sessions_read on sessions for select using (host_id = auth.uid());
drop policy if exists sessions_insert on sessions;
create policy sessions_insert on sessions
  for insert with check (
    host_id = auth.uid() and owns_group(group_id)
    and (
      is_premium(auth.uid())
      or (courts <= cfg('free_max_courts')
          and not exists (select 1 from sessions s
                          where s.host_id = auth.uid() and s.ended_at is null))
    )
  );
drop policy if exists sessions_update on sessions;
create policy sessions_update on sessions
  for update using (host_id = auth.uid())
  with check (host_id = auth.uid()
              and (is_premium(auth.uid()) or courts <= cfg('free_max_courts')));
drop policy if exists sessions_delete on sessions;
create policy sessions_delete on sessions for delete using (host_id = auth.uid());

drop policy if exists rounds_rw on rounds;
create policy rounds_rw on rounds
  for all using (owns_session(session_id)) with check (owns_session(session_id));

drop policy if exists matches_rw on matches;
create policy matches_rw on matches
  for all using (owns_round(round_id)) with check (owns_round(round_id));

drop policy if exists locked_rw on locked_pairs;
create policy locked_rw on locked_pairs
  for all using (owns_group(group_id)) with check (owns_group(group_id));

-- ═══════════════════════════════════════════════════════════════════════════
-- Season standings — the premium feature. Points across every session in a
-- group, which is why matches are normalised instead of JSON.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function group_standings(g uuid)
returns table (player_id uuid, name text, tier skill_tier,
               points bigint, games bigint, wins bigint, losses bigint)
language sql stable security definer set search_path = public as $$
  with played as (
    select unnest(m.team_a) as pid, m.winner = 'a' as won,
           case when m.winner = 'a' then m.win_score else m.lose_score end as pts
      from matches m
      join rounds r  on r.id = m.round_id
      join sessions s on s.id = r.session_id
     where s.group_id = g and m.winner is not null
    union all
    select unnest(m.team_b), m.winner = 'b',
           case when m.winner = 'b' then m.win_score else m.lose_score end
      from matches m
      join rounds r  on r.id = m.round_id
      join sessions s on s.id = r.session_id
     where s.group_id = g and m.winner is not null
  )
  select p.id, p.name, p.tier,
         coalesce(sum(pl.pts), 0)::bigint,
         count(pl.pid)::bigint,
         count(*) filter (where pl.won)::bigint,
         count(*) filter (where not pl.won)::bigint
    from players p
    left join played pl on pl.pid = p.id
   where p.group_id = g and owns_group(g)
   group by p.id, p.name, p.tier
   order by 4 desc, 6 desc;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Admin dashboard. Query with the service key only — never from the app.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace view admin_overview as
  select h.id, h.email, h.created_at as joined,
         e.status, e.expires_at, e.source,
         (select count(*) from groups   g where g.host_id = h.id) as groups,
         (select count(*) from players  p join groups g on g.id = p.group_id
           where g.host_id = h.id)                                as players,
         (select count(*) from sessions s where s.host_id = h.id) as sessions,
         (select max(s.started_at) from sessions s where s.host_id = h.id) as last_session
    from hosts h
    left join entitlements e on e.host_id = h.id;

revoke all on admin_overview from anon, authenticated;
