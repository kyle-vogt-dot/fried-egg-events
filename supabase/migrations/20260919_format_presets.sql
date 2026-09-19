alter table tournaments add column if not exists event_kind text;
alter table tournaments add column if not exists roster_max int;
alter table tournaments add column if not exists players_per_match int;
alter table tournaments add column if not exists scoring_type text;
alter table tournaments add column if not exists play_format text;
alter table tournaments add column if not exists points_per_hole numeric;
alter table tournaments add column if not exists halved_points numeric;
alter table tournaments add column if not exists match_win_bonus numeric;

create table if not exists league_matches (
  id uuid primary key default gen_random_uuid(),
  event_id bigint references tournaments(id) on delete cascade,
  round_id bigint references event_rounds(id) on delete cascade,
  home_team text not null,
  away_team text,
  created_at timestamptz default now()
);

create index if not exists league_matches_event_id_idx on league_matches (event_id);
create index if not exists league_matches_round_id_idx on league_matches (round_id);

alter table league_matches enable row level security;

drop policy if exists "authenticated read league_matches" on league_matches;
create policy "authenticated read league_matches"
  on league_matches for select to authenticated using (true);

drop policy if exists "authenticated write league_matches" on league_matches;
create policy "authenticated write league_matches"
  on league_matches for all to authenticated using (true) with check (true);
