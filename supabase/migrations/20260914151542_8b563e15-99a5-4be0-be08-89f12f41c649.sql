CREATE TABLE public.competitions (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  season text not null,
  name text not null,
  country text,
  source text not null default 'openfootball',
  created_at timestamptz not null default now(),
  unique (code, season)
);
GRANT SELECT ON public.competitions TO anon, authenticated;
GRANT ALL ON public.competitions TO service_role;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "competitions public read" ON public.competitions FOR SELECT USING (true);

CREATE TABLE public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  country text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.teams TO anon, authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams public read" ON public.teams FOR SELECT USING (true);

CREATE TABLE public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions(id) on delete cascade,
  home_team_id uuid not null references public.teams(id) on delete cascade,
  away_team_id uuid not null references public.teams(id) on delete cascade,
  kickoff timestamptz not null,
  round text,
  status text not null default 'SCHEDULED',
  ft_home int,
  ft_away int,
  ht_home int,
  ht_away int,
  source text not null default 'openfootball',
  created_at timestamptz not null default now(),
  unique (competition_id, home_team_id, away_team_id, kickoff)
);
CREATE INDEX matches_kickoff_idx ON public.matches (kickoff);
CREATE INDEX matches_home_idx ON public.matches (home_team_id);
CREATE INDEX matches_away_idx ON public.matches (away_team_id);
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches public read" ON public.matches FOR SELECT USING (true);

CREATE TABLE public.snapshots (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  version text not null,
  inputs_hash text not null,
  data_quality numeric not null,
  stability numeric not null,
  consensus numeric not null,
  verdict text not null,
  probabilities jsonb not null,
  engines jsonb not null,
  simulation jsonb not null,
  evidence jsonb not null,
  conflicts jsonb not null default '[]'::jsonb,
  source_health jsonb not null default '{}'::jsonb,
  reasoning jsonb,
  created_at timestamptz not null default now()
);
CREATE INDEX snapshots_match_idx ON public.snapshots (match_id, created_at desc);
GRANT SELECT ON public.snapshots TO anon, authenticated;
GRANT ALL ON public.snapshots TO service_role;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots public read" ON public.snapshots FOR SELECT USING (true);

CREATE TABLE public.predictions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  market text not null,
  selection text not null,
  probability numeric not null,
  fair_odds numeric,
  confidence numeric not null,
  stability numeric not null,
  consensus numeric not null,
  is_headline boolean not null default false,
  status text not null default 'OPEN',
  outcome boolean,
  brier numeric,
  log_loss numeric,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX predictions_match_idx ON public.predictions (match_id);
CREATE INDEX predictions_status_idx ON public.predictions (status);
GRANT SELECT ON public.predictions TO anon, authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "predictions public read" ON public.predictions FOR SELECT USING (true);

CREATE TABLE public.engine_predictions (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.snapshots(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  competition_id uuid not null references public.competitions(id) on delete cascade,
  engine text not null,
  market text not null,
  probability numeric not null,
  status text not null default 'OPEN',
  outcome boolean,
  brier numeric,
  log_loss numeric,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
CREATE INDEX engine_predictions_engine_idx ON public.engine_predictions (engine, market);
CREATE INDEX engine_predictions_status_idx ON public.engine_predictions (status);
GRANT SELECT ON public.engine_predictions TO anon, authenticated;
GRANT ALL ON public.engine_predictions TO service_role;
ALTER TABLE public.engine_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine predictions public read" ON public.engine_predictions FOR SELECT USING (true);

CREATE TABLE public.ingest_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  dataset text not null,
  status text not null,
  matches_ingested int not null default 0,
  detail text,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.ingest_runs TO anon, authenticated;
GRANT ALL ON public.ingest_runs TO service_role;
ALTER TABLE public.ingest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ingest runs public read" ON public.ingest_runs FOR SELECT USING (true);