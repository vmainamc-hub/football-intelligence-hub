import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Database, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  findFixtures,
  kickoffKenya,
  loadFreeFixtures,
  type MatchRow,
} from "@/lib/gfi/intelligence";
import { getUpcomingFixtures } from "@/lib/gfi/upcoming";
import { searchUniversalFixtures } from "@/lib/gfi/universal-sources";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [query, setQuery] = useState("");
  const data = useQuery({
    queryKey: ["free-fixtures"],
    queryFn: loadFreeFixtures,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const localResults = useMemo(() => findFixtures(data.data ?? [], query), [data.data, query]);
  const remote = useQuery({
    queryKey: ["universal-search", query],
    queryFn: () => searchUniversalFixtures({ data: { query } }),
    enabled: query.trim().length >= 3 && localResults.length === 0,
    staleTime: 60_000,
  });
  const results = localResults.length
    ? localResults
    : (remote.data ?? []).map((m) => ({
        ...m,
        league: m.league ?? "Worldwide Football",
        code: "GLOBAL",
        season: "global",
      }));
  const upcoming = useMemo(() => getUpcomingFixtures(data.data ?? [], 24), [data.data]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto max-w-6xl px-5 py-10 lg:px-10 lg:py-16">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="label-xs">
            <span className="pulse-dot mr-2 inline-block size-1.5 rounded-full bg-primary" /> GLOBAL
            FOOTBALL INTELLIGENCE
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" /> FREE MODE · MULTI-SOURCE
          </div>
        </div>
        <section className="max-w-4xl">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Investigate any match. <span className="text-primary">Let the evidence speak.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
            Search the connected global fixture fabric, then open one match to see the evidence,
            engine agreement, simulation and final decision.
          </p>
        </section>
        <div className="panel mt-8 max-w-4xl p-2 shadow-panel">
          <div className="flex items-center gap-3 px-4">
            <Search className="size-5 text-primary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any team or fixture — Braga, Newcastle, Real Madrid vs Barcelona"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {data.isFetching || remote.isFetching ? (
              <span className="label-xs">sweeping sources</span>
            ) : (
              <span className="label-xs">{data.data?.length ?? 0} registered groups</span>
            )}
          </div>
        </div>
        {query ? (
          <div className="mt-3 max-w-4xl overflow-hidden rounded-lg border border-border bg-card">
            {results.length ? (
              results
                .slice(0, 24)
                .map((m, i) => (
                  <FixtureRow
                    key={`${m.home}-${m.away}-${m.date}-${m.time ?? ""}-${m.source ?? ""}-${m.sourceId ?? i}`}
                    fixture={m}
                  />
                ))
            ) : (
              <div className="p-5 text-sm text-muted-foreground">
                No fixture found yet in the connected public sources. Try the full team name.
              </div>
            )}
          </div>
        ) : (
          <section className="mt-10 max-w-5xl">
            <div className="flex items-end justify-between">
              <div>
                <div className="label-xs text-primary">UPCOMING</div>
                <h2 className="mt-1 text-2xl font-semibold">Next matches</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {upcoming.length} shown · refreshed every 5 min
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {upcoming.map((m, i) => (
                <FixtureRow
                  key={`${m.home}-${m.away}-${m.date}-${m.time ?? ""}-${m.source ?? ""}-${i}`}
                  fixture={m}
                />
              ))}
            </div>
            {!upcoming.length && !data.isFetching && (
              <div className="panel mt-4 p-6 text-sm text-muted-foreground">
                The global fixture fabric is waiting for an available public feed.
              </div>
            )}
          </section>
        )}
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          <Signal
            icon={Database}
            title="Multi-source fixture fabric"
            text="Primary historical data is enriched by open football datasets, live feeds and worldwide discovery."
          />
          <Signal
            icon={Sparkles}
            title="Evidence, not templates"
            text="Every match is analyzed through the same authoritative server pipeline rather than a fixed prediction card."
          />
          <Signal
            title="One decision"
            text="Models, simulation, data quality and conflict checks converge into one traceable verdict."
          />
        </div>
      </div>
    </div>
  );
}

function FixtureRow({
  fixture,
}: {
  fixture: MatchRow & { league?: string; code?: string; sourceId?: string };
}) {
  const id = encodeURIComponent(
    JSON.stringify({
      h: fixture.home,
      a: fixture.away,
      d: fixture.date,
      t: fixture.time ?? "",
      c: fixture.code ?? "",
      s: fixture.source ?? "",
      i: fixture.sourceId ?? "",
    }),
  );
  const kenya = kickoffKenya(fixture);
  const time = kenya?.match(/ (\d{2}:\d{2})$/)?.[1];
  return (
    <Link
      to="/match/$matchId"
      params={{ matchId: id }}
      className="flex items-center gap-4 border-b border-border bg-card px-5 py-4 last:border-0 hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}
        </div>
        <div className="label-xs mt-1">
          {fixture.league ?? "Worldwide Football"} · {time ? `${time} EAT` : fixture.date} ·{" "}
          {fixture.source ?? "public"}
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground" />
    </Link>
  );
}
function Signal({
  icon: Icon,
  title,
  text,
}: {
  icon?: typeof Database;
  title: string;
  text: string;
}) {
  return (
    <div className="panel p-5">
      {Icon && <Icon className="size-5 text-primary" />}
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
  );
}
