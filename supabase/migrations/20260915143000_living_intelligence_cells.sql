create table if not exists public.team_intelligence_cells (
  team_key text primary key,
  team_name text not null,
  observed_at timestamptz not null default now(),
  last_mined_at timestamptz,
  evidence_count integer not null default 0,
  source_count integer not null default 0,
  completeness numeric not null default 0,
  status text not null default 'ACTIVE',
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists team_intelligence_cells_mined_idx on public.team_intelligence_cells(last_mined_at);

create table if not exists public.match_intelligence_cells (
  match_key text primary key,
  home_team_key text not null,
  away_team_key text not null,
  home_team_name text not null,
  away_team_name text not null,
  competition text,
  kickoff timestamptz,
  observed_at timestamptz not null default now(),
  last_mined_at timestamptz,
  next_mine_at timestamptz,
  evidence_count integer not null default 0,
  source_count integer not null default 0,
  completeness numeric not null default 0,
  status text not null default 'ACTIVE',
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists match_intelligence_cells_kickoff_idx on public.match_intelligence_cells(kickoff);
create index if not exists match_intelligence_cells_next_mine_idx on public.match_intelligence_cells(next_mine_at);
create index if not exists match_intelligence_cells_teams_idx on public.match_intelligence_cells(home_team_key,away_team_key);

create table if not exists public.evidence_mining_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  requested_count integer not null default 0,
  processed_count integer not null default 0,
  evidence_found integer not null default 0,
  sources_with_data integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING',
  detail jsonb not null default '{}'::jsonb
);
create index if not exists evidence_mining_runs_started_idx on public.evidence_mining_runs(started_at desc);

grant select on public.team_intelligence_cells, public.match_intelligence_cells, public.evidence_mining_runs to anon, authenticated;
grant all on public.team_intelligence_cells, public.match_intelligence_cells, public.evidence_mining_runs to service_role;
alter table public.team_intelligence_cells enable row level security;
alter table public.match_intelligence_cells enable row level security;
alter table public.evidence_mining_runs enable row level security;
drop policy if exists "team intelligence public read" on public.team_intelligence_cells;
drop policy if exists "match intelligence public read" on public.match_intelligence_cells;
drop policy if exists "mining runs public read" on public.evidence_mining_runs;
create policy "team intelligence public read" on public.team_intelligence_cells for select using (true);
create policy "match intelligence public read" on public.match_intelligence_cells for select using (true);
create policy "mining runs public read" on public.evidence_mining_runs for select using (true);
