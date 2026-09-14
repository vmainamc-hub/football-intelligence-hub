CREATE TABLE IF NOT EXISTS public.source_observations (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_family text not null,
  source_record_id text,
  dataset text not null,
  observed_at timestamptz not null default now(),
  valid_from timestamptz,
  valid_to timestamptz,
  entity_type text not null,
  entity_key text not null,
  payload jsonb not null,
  content_hash text,
  quality numeric not null default 0,
  freshness_seconds bigint,
  created_at timestamptz not null default now(),
  unique (source, dataset, source_record_id, entity_type, entity_key)
);
CREATE INDEX IF NOT EXISTS source_observations_entity_idx ON public.source_observations (entity_type, entity_key, observed_at desc);
CREATE INDEX IF NOT EXISTS source_observations_source_idx ON public.source_observations (source, dataset, observed_at desc);
GRANT SELECT ON public.source_observations TO anon, authenticated;
GRANT ALL ON public.source_observations TO service_role;
ALTER TABLE public.source_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source observations public read" ON public.source_observations FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.team_aliases (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source text not null default 'system',
  confidence numeric not null default 1,
  created_at timestamptz not null default now(),
  unique (normalized_alias, source)
);
CREATE INDEX IF NOT EXISTS team_aliases_normalized_idx ON public.team_aliases (normalized_alias);
GRANT SELECT ON public.team_aliases TO anon, authenticated;
GRANT ALL ON public.team_aliases TO service_role;
ALTER TABLE public.team_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team aliases public read" ON public.team_aliases FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.research_runs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  canonical_home text,
  canonical_away text,
  competition text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'RUNNING',
  sources_attempted int not null default 0,
  sources_with_data int not null default 0,
  observations_found int not null default 0,
  evidence_coverage numeric not null default 0,
  notes jsonb not null default '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS research_runs_requested_idx ON public.research_runs (requested_at desc);
GRANT SELECT ON public.research_runs TO anon, authenticated;
GRANT ALL ON public.research_runs TO service_role;
ALTER TABLE public.research_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research runs public read" ON public.research_runs FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.research_evidence (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  source_observation_id uuid references public.source_observations(id) on delete cascade,
  source text not null,
  source_family text not null,
  evidence_type text not null,
  statement text not null,
  value jsonb,
  quality numeric not null default 0,
  freshness_seconds bigint,
  independence_key text,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS research_evidence_run_idx ON public.research_evidence (research_run_id, created_at desc);
CREATE INDEX IF NOT EXISTS research_evidence_match_idx ON public.research_evidence (match_id, created_at desc);
GRANT SELECT ON public.research_evidence TO anon, authenticated;
GRANT ALL ON public.research_evidence TO service_role;
ALTER TABLE public.research_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research evidence public read" ON public.research_evidence FOR SELECT USING (true);
