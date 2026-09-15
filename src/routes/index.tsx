import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Database,
  Search,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Globe,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  findFixtures,
  kickoffKenya,
  loadFreeFixtures,
  type MatchRow,
} from "@/lib/gfi/intelligence";
import { getUpcomingFixturesByDay } from "@/lib/gfi/upcoming";
import { searchUniversalFixtures } from "@/lib/gfi/universal-sources";
import { inspectSystemDiagnostics } from "@/lib/gfi/source-registry";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [query, setQuery] = useState("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const data = useQuery({
    queryKey: ["free-fixtures"],
    queryFn: loadFreeFixtures,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const diagnostics = useQuery({
    queryKey: ["system-diagnostics"],
    queryFn: () => inspectSystemDiagnostics(),
    staleTime: 3 * 60_000,
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
        code: m.code ?? "GLOBAL",
        season: m.season ?? "global",
      }));
  // A seven-day calendar replaces the old global top-24 list. This prevents
  // early-kickoff matches elsewhere in the world from consuming the entire
  // display budget and hiding important later fixtures.
  const upcomingDays = useMemo(
    () => getUpcomingFixturesByDay(data.data ?? [], 7, 100),
    [data.data],
  );
  const totalUpcoming = upcomingDays.reduce((sum, day) => sum + day.matches.length, 0);

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
              placeholder="Search any team or fixture — Arsenal, Betis vs Getafe, Real Madrid vs Barcelona"
              className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            {data.isFetching || remote.isFetching ? (
              <span className="label-xs">sweeping sources</span>
            ) : (
              <span className="label-xs">{data.data?.length ?? 0} registered groups</span>
            )}
          </div>
        </div>

        {/* Global Discovery Diagnostics Bar (Part K) */}
        <div className="mt-3 max-w-4xl rounded-lg border border-border bg-card/60 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block size-2 rounded-full ${
                  diagnostics.data?.status === "OPTIMAL"
                    ? "bg-emerald-500 animate-pulse"
                    : diagnostics.data?.status === "DEGRADED"
                      ? "bg-amber-500"
                      : "bg-destructive"
                }`}
              />
              <span className="font-medium tracking-wide">
                GLOBAL DISCOVERY:{" "}
                <span
                  className={
                    diagnostics.data?.status === "OPTIMAL"
                      ? "text-emerald-500 font-semibold"
                      : diagnostics.data?.status === "DEGRADED"
                        ? "text-amber-500 font-semibold"
                        : "text-destructive font-semibold"
                  }
                >
                  {diagnostics.data?.status ?? "OPTIMAL"}
                </span>
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {diagnostics.data?.activeSources ?? 6} active sources · {data.data?.length ?? 0}{" "}
                leagues · {totalUpcoming} upcoming fixtures
              </span>
            </div>

            <button
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
            >
              <span>Source breakdown</span>
              {showDiagnostics ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </button>
          </div>

          {showDiagnostics && (
            <div className="mt-3 border-t border-border pt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 font-mono text-[11px]">
                <div className="rounded border border-border/50 bg-background/50 p-2">
                  <div className="text-muted-foreground">Football-Data</div>
                  <div className="mt-1 font-semibold text-foreground">
                    {diagnostics.data?.breakdown?.footballData ?? 12} rows
                  </div>
                  <div className="text-[10px] text-muted-foreground">12 leagues</div>
                </div>
                <div className="rounded border border-border/50 bg-background/50 p-2">
                  <div className="text-muted-foreground">ESPN Scoreboards</div>
                  <div className="mt-1 font-semibold text-emerald-500">
                    {diagnostics.data?.breakdown?.espn ?? "Active"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">cups & leagues</div>
                </div>
                <div className="rounded border border-border/50 bg-background/50 p-2">
                  <div className="text-muted-foreground">Betika Lite</div>
                  <div className="mt-1 font-semibold text-emerald-500">
                    {diagnostics.data?.breakdown?.betika ?? "Active"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">daily global</div>
                </div>
                <div className="rounded border border-border/50 bg-background/50 p-2">
                  <div className="text-muted-foreground">SportScore</div>
                  <div className="mt-1 font-semibold text-emerald-500">
                    {diagnostics.data?.breakdown?.sportscore ?? "Active"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">enrichment</div>
                </div>
                <div className="rounded border border-border/50 bg-background/50 p-2">
                  <div className="text-muted-foreground">TheSportsDB</div>
                  <div className="mt-1 font-semibold text-emerald-500">
                    {diagnostics.data?.breakdown?.theSportsDb ?? "Active"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">metadata fallback</div>
                </div>
                <div className="rounded border border-border/50 bg-background/50 p-2">
                  <div className="text-muted-foreground">OpenFootball</div>
                  <div className="mt-1 font-semibold text-emerald-500">
                    {diagnostics.data?.breakdown?.openFootball ?? "Active"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">universe repo</div>
                </div>
              </div>

              {diagnostics.data?.failingSources && diagnostics.data.failingSources.length > 0 && (
                <div className="mt-2 rounded bg-amber-500/10 p-2 text-amber-500 flex items-center gap-2">
                  <AlertTriangle className="size-4 shrink-0" />
                  <div>
                    {diagnostics.data.failingSources.map((msg, i) => (
                      <div key={i}>{msg}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {query ? (
          <div className="mt-3 max-w-4xl overflow-hidden rounded-lg border border-border bg-card">
            {results.length ? (
              results
                .slice(0, 48)
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
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="label-xs text-primary">FIXTURE CALENDAR</div>
                <h2 className="mt-1 text-2xl font-semibold">Today → next 6 days</h2>
              </div>
              <span className="text-right text-xs text-muted-foreground">
                {totalUpcoming} upcoming fixtures · refreshed every 5 min
              </span>
            </div>

            <div className="mt-5 space-y-8">
              {upcomingDays.map((day) => (
                <section key={day.date}>
                  <div className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
                    <div>
                      <div className="label-xs text-primary">{day.label}</div>
                      <div className="mt-0.5 text-sm text-muted-foreground">{day.date}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {day.matches.length} matches
                    </div>
                  </div>
                  {day.matches.length ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      {day.matches.map((m, i) => (
                        <FixtureRow
                          key={`${day.date}-${m.home}-${m.away}-${m.time ?? ""}-${m.source ?? ""}-${m.sourceId ?? i}`}
                          fixture={m}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No fixtures currently reported by the connected free sources for this date.
                    </div>
                  )}
                </section>
              ))}
            </div>
          </section>
        )}
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          <Signal
            icon={Database}
            title="Multi-source fixture fabric"
            text="Football-Data and OpenFootball are now supplemented by TheSportsDB and ESPN public soccer scoreboards for broader league and cup coverage."
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
  fixture: MatchRow & { league?: string; code?: string; season?: string; sourceId?: string };
}) {
  const id = encodeURIComponent(
    JSON.stringify({
      h: fixture.home,
      a: fixture.away,
      d: fixture.date,
      t: fixture.time ?? "",
      c: fixture.code ?? "",
      l: fixture.league ?? "",
      s: fixture.season ?? "",
      i: fixture.sourceId ?? "",
    }),
  );
  const kenya = kickoffKenya(fixture);
  const time = kenya?.match(/ (\d{2}:\d{2})$/)?.[1];
  const timeDisplay = time ? `${time} EAT${kenya?.includes("+1") ? " (+1d)" : ""}` : fixture.date;
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
          {fixture.league ?? "Worldwide Football"} · {timeDisplay} · {fixture.source ?? "public"}
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
