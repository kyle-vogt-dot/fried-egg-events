create table if not exists league_lineups (
  id uuid primary key default gen_random_uuid(),
  event_id bigint references tournaments(id) on delete cascade,
  round_id bigint references event_rounds(id) on delete cascade,
  team_name text not null,
  registration_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  unique (event_id, round_id, team_name)
);

create table if not exists league_week_results (
  id uuid primary key default gen_random_uuid(),
  event_id bigint references tournaments(id) on delete cascade,
  round_id bigint references event_rounds(id) on delete cascade,
  team_name text not null,
  hole_points numeric not null default 0,
  bonus numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz default now(),
  unique (event_id, round_id, team_name)
);

create index if not exists league_lineups_event_round_idx
  on league_lineups (event_id, round_id);
create index if not exists league_week_results_event_round_idx
  on league_week_results (event_id, round_id);

alter table league_lineups enable row level security;
alter table league_week_results enable row level security;

drop policy if exists "read league_lineups" on league_lineups;
create policy "read league_lineups"
  on league_lineups for select using (true);

drop policy if exists "write league_lineups" on league_lineups;
create policy "write league_lineups"
  on league_lineups for all to authenticated using (true) with check (true);

drop policy if exists "read league_week_results" on league_week_results;
create policy "read league_week_results"
  on league_week_results for select using (true);

drop policy if exists "write league_week_results" on league_week_results;
create policy "write league_week_results"
  on league_week_results for all to authenticated using (true) with check (true);
