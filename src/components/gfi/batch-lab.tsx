import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Save, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  runBatchAnalysis,
  type BatchAnalysisResponse,
  type BatchSelection,
} from "@/lib/gfi/batch-analysis";
import { saveAuthoritativePrediction } from "@/lib/gfi/prediction-ledger";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const EXAMPLES = [
  "Predict today's next matches",
  "Build me a slip of 20 today's teams",
  "Give me 20 safest picks",
  "Give me 15 GG games",
  "Give me 10 best over 1.5 picks today",
];

export function BatchLab() {
  const [request, setRequest] = useState("Predict today's next matches");
  const [result, setResult] = useState<BatchAnalysisResponse | null>(null);
  const [selected, setSelected] = useState<BatchSelection | null>(null);
  const mutation = useMutation({
    mutationFn: (value: string) => runBatchAnalysis({ data: { request: value } }),
    onSuccess: (data) => {
      setResult(data);
      setSelected(data.selections[0] ?? null);
    },
  });

  const submit = () => {
    const value = request.trim();
    if (!value || mutation.isPending) return;
    mutation.mutate(value);
  };

  return (
    <Shell>
      <section className="panel p-5">
        <div className="label-xs">REQUEST-DRIVEN PREDICTION BUILDER</div>
        <h2 className="mt-2 text-xl font-semibold">Ask the intelligence system what you need</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The system searches a broad pool of today's fixtures, runs the authoritative pipeline,
          qualifies the requested market, and returns ranked actionable selections.
        </p>
        <div className="mt-4 flex gap-2">
          <input
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Ask for today's predictions..."
            className="min-w-0 flex-1 rounded border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={submit}
            disabled={mutation.isPending || !request.trim()}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            <Search className="size-4" />
            {mutation.isPending ? "Scanning…" : "Build"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => setRequest(example)}
              className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>
      </section>

      {mutation.error && (
        <div className="mt-5 panel p-5">
          <AlertTriangle className="size-5 text-warning" />
          <p className="mt-2 text-sm">Batch intelligence failed to run.</p>
          <p className="mt-2 text-xs text-muted-foreground">{String(mutation.error)}</p>
          <button
            onClick={submit}
            className="mt-4 inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm"
          >
            <RefreshCw className="size-4" /> Retry
          </button>
        </div>
      )}

      {result && (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="REQUEST" value={result.request} />
            <Stat label="CANDIDATE POOL" value={String(result.candidatePool)} />
            <Stat label="ANALYSED" value={String(result.analysed)} />
            <Stat label="RETURNED" value={`${result.returned}/${result.requested}`} />
          </div>

          <div className="mt-4 rounded border border-border px-4 py-3 text-sm">
            <b>RESULT:</b> {result.message}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_390px]">
            <div className="panel overflow-hidden">
              <div className="grid grid-cols-[42px_1fr_150px_90px_85px_80px] border-b border-border px-4 py-3 label-xs">
                <span>#</span>
                <span>MATCH</span>
                <span>PICK</span>
                <span>PROB</span>
                <span>CONF</span>
                <span>RISK</span>
              </div>
              {result.selections.length ? (
                result.selections.map((row, i) => (
                  <button
                    key={`${row.fixture.date}-${row.fixture.home}-${row.fixture.away}-${row.fixture.time ?? ""}`}
                    onClick={() => setSelected(row)}
                    className={`grid w-full grid-cols-[42px_1fr_150px_90px_85px_80px] border-b border-border px-4 py-4 text-left hover:bg-muted/30 ${selected === row ? "bg-muted/40" : ""}`}
                  >
                    <span className="metric">{i + 1}</span>
                    <span>
                      <b>{row.fixture.home}</b> <span className="text-muted-foreground">vs</span>{" "}
                      <b>{row.fixture.away}</b>
                      <small className="mt-1 block text-muted-foreground">
                        {row.fixture.league} · {row.fixture.date} {row.fixture.time ?? ""}
                      </small>
                    </span>
                    <span className="text-xs font-medium">{row.market.selection}</span>
                    <span className="metric">{pct(row.market.probability)}</span>
                    <span className="metric">{row.analysis.confidence}%</span>
                    <span className="text-xs">{row.analysis.risk}</span>
                  </button>
                ))
              ) : (
                <div className="p-8 text-sm text-muted-foreground">
                  No market currently clears the qualification rules for this request. No picks were
                  fabricated.
                </div>
              )}
            </div>

            <div className="panel p-5">
              {selected ? (
                <SelectionPanel selected={selected} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run a request to inspect the decision trace.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function SelectionPanel({ selected }: { selected: BatchSelection }) {
  return (
    <>
      <div className="label-xs">QUALIFIED ACTION</div>
      <h2 className="mt-2 font-semibold">
        {selected.fixture.home} vs {selected.fixture.away}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {selected.fixture.league} · {selected.fixture.date} {selected.fixture.time ?? ""}
      </p>
      <div className="mt-5 border border-border p-4">
        <div className="label-xs">{selected.market.market}</div>
        <div className="mt-1 text-lg font-semibold">{selected.market.selection}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Probability" value={pct(selected.market.probability)} />
          <Metric label="Confidence" value={`${selected.analysis.confidence}%`} />
          <Metric label="Robustness" value={`${selected.analysis.robustness.score}%`} />
          <Metric label="Quality" value={`${selected.analysis.quality}%`} />
          <Metric label="Agreement" value={pct(selected.analysis.consensus.agreement)} />
          <Metric label="Conflict" value={pct(selected.analysis.consensus.conflict)} />
        </div>
      </div>
      <p className="mt-4 text-sm">{selected.reason}</p>
      <div className="mt-4 text-xs text-muted-foreground">
        Authority: {selected.analysis.decision} · {selected.analysis.pipeline.evidenceMode} ·{" "}
        {selected.analysis.pipeline.modelContext}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {selected.analysis.pipeline.historicalRowsLoaded} historical rows ·{" "}
        {selected.analysis.pipeline.modelContextRows} model rows ·{" "}
        {selected.analysis.engines.length} engines
      </div>
      <button
        onClick={() => saveAuthoritativePrediction(selected.analysis, selected.fixture)}
        className="mt-5 inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        <Save className="size-4" /> Save prediction
      </button>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-4">
      <div className="label-xs">{label}</div>
      <div className="mt-2 text-sm font-medium">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border p-3">
      <div className="label-xs">{label}</div>
      <div className="metric mt-1">{value}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
      <Link to="/" className="label-xs">
        ← HOME
      </Link>
      <header className="mt-7 border-b border-border pb-6">
        <div className="label-xs text-primary">PORTFOLIO INTELLIGENCE</div>
        <h1 className="mt-2 text-3xl font-semibold">Batch Intelligence</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Request-driven portfolio prediction using the authoritative multi-model football
          intelligence engine.
        </p>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
