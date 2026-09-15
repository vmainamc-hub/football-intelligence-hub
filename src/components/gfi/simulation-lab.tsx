import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { loadFreeFixtures, kickoffKenya, type MatchRow } from "@/lib/gfi/intelligence";
import { analyzeFreeMatch } from "@/lib/gfi/match-analysis";
import { simulateAnalysis, type SimulationSummary } from "@/lib/gfi/simulation-engine";

export const SimulationLab = () => {
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [iterations, setIterations] = useState(10000);
  const [summary, setSummary] = useState<SimulationSummary | null>(null);
  const data = useQuery({
    queryKey: ["simulation-fixtures"],
    queryFn: loadFreeFixtures,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const fixtures = useMemo(
    () =>
      (data.data ?? []).flatMap((group) =>
        group.matches.map((match) => ({ ...match, league: group.league, code: group.code })),
      ),
    [data.data],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fixtures
      .filter((m) => !q || `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const au = a.hg === undefined || a.ag === undefined;
        const bu = b.hg === undefined || b.ag === undefined;
        if (au !== bu) return au ? -1 : 1;
        return `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`);
      })
      .slice(0, 60);
  }, [fixtures, query]);
  const selected = useMemo(
    () => visible.find((m) => fixtureKey(m) === selectedKey) ?? visible[0],
    [visible, selectedKey],
  );
  const analysis = useQuery({
    queryKey: [
      "simulation-authoritative",
      selected?.code,
      selected?.home,
      selected?.away,
      selected?.date,
      selected?.time,
      selected?.source,
      selected?.sourceId,
    ],
    queryFn: () => analyzeFreeMatch({ data: { code: selected!.code, fixture: selected! } }),
    enabled: !!selected,
    staleTime: 10 * 60_000,
  });

  const run = () => {
    if (!analysis.data) return;
    setSummary(simulateAnalysis(analysis.data, iterations));
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
      <Link to="/" className="label-xs">
        ← HOME
      </Link>
      <header className="mt-7 border-b border-border pb-6">
        <div className="label-xs text-primary">SCENARIO ENGINE</div>
        <h1 className="mt-2 text-3xl font-semibold">Simulation Lab</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Select any fixture, let the authoritative engine build its evidence context, then simulate
          thousands of possible match worlds from that exact analysis.
        </p>
      </header>

      <main className="mt-6 grid gap-5 lg:grid-cols-[360px_1fr]">
        <aside className="panel overflow-hidden">
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search any team or competition"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {visible.map((fixture) => {
              const key = fixtureKey(fixture);
              const active = key === fixtureKey(selected);
              return (
                <button
                  key={key}
                  onClick={() => {
                    setSelectedKey(key);
                    setSummary(null);
                  }}
                  className={`w-full border-b border-border p-4 text-left ${active ? "bg-muted/40" : "hover:bg-muted/20"}`}
                >
                  <div className="text-sm font-medium">
                    {fixture.home} <span className="text-muted-foreground">vs</span> {fixture.away}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {fixture.league} · {fixture.date}
                    {fixture.time
                      ? ` · ${kickoffKenya(fixture)?.split(" ")[1] ?? fixture.time} EAT`
                      : ""}
                  </div>
                </button>
              );
            })}
            {!visible.length && (
              <div className="p-5 text-sm text-muted-foreground">No fixtures match the search.</div>
            )}
          </div>
          <div className="border-t border-border p-3 text-[11px] text-muted-foreground">
            {fixtures.length.toLocaleString()} fixtures available from the connected feed.
          </div>
        </aside>

        <section>
          {!selected ? (
            <div className="panel p-8 text-sm text-muted-foreground">No fixture is available.</div>
          ) : analysis.isLoading ? (
            <div className="panel p-8 text-sm text-muted-foreground">
              Building authoritative match context…
            </div>
          ) : analysis.error ? (
            <div className="panel p-8 text-sm text-destructive">
              The backend could not analyse this fixture.
            </div>
          ) : analysis.data ? (
            <>
              <div className="panel p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="label-xs text-primary">CANONICAL MATCH</div>
                    <h2 className="mt-2 text-2xl font-semibold">
                      {selected.home} vs {selected.away}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selected.league} · {selected.date}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-primary/30 px-3 py-1.5 text-xs text-primary">
                    <ShieldCheck className="size-3.5" /> AUTHORITATIVE INPUT READY
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <Mini
                    label={selected.home}
                    value={`${Math.round((analysis.data.probabilities?.home ?? 0) * 100)}%`}
                  />
                  <Mini
                    label="DRAW"
                    value={`${Math.round((analysis.data.probabilities?.draw ?? 0) * 100)}%`}
                  />
                  <Mini
                    label={selected.away}
                    value={`${Math.round((analysis.data.probabilities?.away ?? 0) * 100)}%`}
                  />
                  <Mini label="VERDICT" value={analysis.data.decision?.replace("_", " ") ?? "—"} />
                </div>
              </div>
              <div className="mt-5 panel p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="label-xs text-primary">MONTE CARLO SCENARIOS</div>
                    <h2 className="mt-1 text-xl font-semibold">Stress-test this exact match</h2>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={iterations}
                      onChange={(e) => setIterations(Number(e.target.value))}
                      className="h-9 rounded border border-border bg-background px-2 text-xs"
                    >
                      <option value={5000}>5,000</option>
                      <option value={10000}>10,000</option>
                      <option value={25000}>25,000</option>
                      <option value={50000}>50,000</option>
                    </select>
                    <button
                      onClick={run}
                      className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-xs text-primary-foreground"
                    >
                      <Play className="size-3.5" /> Run simulation
                    </button>
                  </div>
                </div>
                {summary && (
                  <div className="mt-5">
                    <div className="grid gap-3 sm:grid-cols-4">
                      {[
                        ["HOME", summary.homeWin],
                        ["DRAW", summary.draw],
                        ["AWAY", summary.awayWin],
                        ["BTTS", summary.btts],
                      ].map(([label, value]) => (
                        <Metric
                          key={label as string}
                          label={label as string}
                          value={value as number}
                        />
                      ))}
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      {[
                        ["OVER 1.5", summary.over15],
                        ["OVER 2.5", summary.over25],
                        ["OVER 3.5", summary.over35],
                        ["EXPECTED GOALS", summary.expectedGoals],
                      ].map(([label, value]) => (
                        <Metric
                          key={label as string}
                          label={label as string}
                          value={value as number}
                          goals={label === "EXPECTED GOALS"}
                        />
                      ))}
                    </div>
                    <div className="mt-5 rounded border border-border p-4 text-xs text-muted-foreground">
                      {summary.iterations.toLocaleString()} seeded scenario worlds · scenario
                      agreement {Math.round(summary.scenarioAgreement * 100)}% · simulation version{" "}
                      {summary.sourceAnalysisVersion}
                    </div>
                    <div className="mt-5">
                      <div className="label-xs">TOP SCORELINES</div>
                      {summary.topScores.map((score) => (
                        <div
                          key={score.score}
                          className="mt-2 flex justify-between border-b border-border py-2 text-sm"
                        >
                          <span>{score.score.replace("-", " : ")}</span>
                          <span className="font-mono">{(score.probability * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
};

function fixtureKey(m: MatchRow & { code?: string; league?: string }) {
  return JSON.stringify({
    c: m.code ?? "",
    l: m.league ?? "",
    d: m.date,
    t: m.time ?? "",
    h: m.home,
    a: m.away,
    s: m.source ?? "",
    i: m.sourceId ?? "",
  });
}
function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-3">
      <div className="label-xs truncate">{label}</div>
      <div className="metric mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
function Metric({ label, value, goals }: { label: string; value: number; goals?: boolean }) {
  return (
    <div className="border border-border p-4">
      <div className="label-xs">{label}</div>
      <div className="metric mt-2 text-xl font-semibold">
        {goals ? value.toFixed(2) : `${(value * 100).toFixed(1)}%`}
      </div>
    </div>
  );
}
