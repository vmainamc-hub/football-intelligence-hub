import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  autoSettleCompleted,
  clearLedger,
  readLedger,
  settlePrediction,
  type LedgerPrediction,
  calibrationReport,
} from "@/lib/gfi/prediction-ledger";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function PredictionsLab() {
  const [, refresh] = useState(0);
  const ledger = readLedger();
  const settled = ledger.filter((x) => x.status === "SETTLED");
  const wins = settled.filter((x) => x.correct).length;
  const rerender = () => refresh((x) => x + 1);
  return (
    <Shell eyebrow="AUTHORITATIVE LEDGER" title="Prediction History">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["TOTAL", ledger.length],
          ["OPEN", ledger.filter((x) => x.status === "OPEN").length],
          ["SETTLED", settled.length],
          ["HIT RATE", settled.length ? `${((wins / settled.length) * 100).toFixed(1)}%` : "—"],
          ["MODEL", ledger[0]?.analysisVersion ?? "—"],
        ].map(([k, v]) => (
          <div key={String(k)} className="panel p-4">
            <div className="label-xs">{k}</div>
            <div className="metric mt-2 text-xl">{v}</div>
          </div>
        ))}
      </div>
      <div className="my-4 flex justify-between">
        <button
          onClick={() => {
            autoSettleCompleted();
            rerender();
          }}
          className="rounded border border-border px-3 py-2 text-xs"
        >
          Refresh & auto-settle
        </button>
        <button
          onClick={() => {
            clearLedger();
            rerender();
          }}
          className="rounded border border-border px-3 py-2 text-xs"
        >
          Clear ledger
        </button>
      </div>
      <div className="panel">
        {ledger.length ? (
          ledger.map((p) => <PredictionRow key={p.id} p={p} refresh={rerender} />)
        ) : (
          <div className="p-8 text-sm text-muted-foreground">
            No saved predictions. Save a model decision from Match Intelligence or Batch
            Intelligence.
          </div>
        )}
      </div>
    </Shell>
  );
}

export function AuditLab() {
  const [, refresh] = useState(0);
  const ledger = readLedger();
  const settled = ledger.filter((x) => x.status === "SETTLED");
  const report = calibrationReport();
  return (
    <Shell eyebrow="LEARNING LOOP" title="Post-Match Audit">
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["SETTLED", report.settled],
          ["CORRECT", report.wins],
          ["HIT RATE", pct(report.hitRate)],
          ["BRIER", report.brier.toFixed(3)],
          ["LOG LOSS", report.logLoss.toFixed(3)],
        ].map(([k, v]) => (
          <div key={String(k)} className="panel p-4">
            <div className="label-xs">{k}</div>
            <div className="metric mt-2 text-xl">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          onClick={() => {
            autoSettleCompleted();
            refresh((x) => x + 1);
          }}
          className="rounded border border-border px-3 py-2 text-xs"
        >
          Auto-settle completed
        </button>
      </div>
      <div className="panel mt-5">
        {settled.length ? (
          settled.map((p) => (
            <div
              key={p.id}
              className="grid gap-2 border-b border-border p-5 last:border-0 md:grid-cols-[1fr_100px_120px_1fr]"
            >
              <b>
                {p.fixture.home} vs {p.fixture.away}
              </b>
              <span className="label-xs">ACTUAL {p.outcome}</span>
              <span className={p.correct ? "text-positive" : "text-destructive"}>
                {p.correct ? "MODEL HIT" : "MODEL MISS"}
              </span>
              <span className="text-xs text-muted-foreground">
                Predicted {p.predictedOutcome} · {p.analysisVersion} · confidence {p.confidence};
                quality {p.quality}; risk {p.risk}.
              </span>
            </div>
          ))
        ) : (
          <div className="p-8 text-sm text-muted-foreground">
            No settled predictions yet. Completed fixtures are settled automatically when their
            result is present in the loaded evidence.
          </div>
        )}
      </div>
    </Shell>
  );
}

function PredictionRow({ p, refresh }: { p: LedgerPrediction; refresh: () => void }) {
  const [out, setOut] = useState<"H" | "D" | "A">("H");
  return (
    <div className="border-b border-border p-5 last:border-0">
      <div className="flex justify-between gap-3">
        <b>
          {p.fixture.home} vs {p.fixture.away}
        </b>
        <span className="label-xs">
          {p.status} · {p.analysisVersion}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            ["H", p.probabilities?.home ?? 0],
            ["D", p.probabilities?.draw ?? 0],
            ["A", p.probabilities?.away ?? 0],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="border border-border p-3">
            <div className="label-xs">{k}</div>
            <div className="metric">{pct(v)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {p.decision} · predicted {p.predictedOutcome} · confidence {p.confidence}% · quality{" "}
        {p.quality} · risk {p.risk}
      </div>
      {p.status === "OPEN" && (
        <div className="mt-3 flex gap-2">
          <select
            value={out}
            onChange={(e) => setOut(e.target.value as "H" | "D" | "A")}
            className="rounded border border-border bg-background px-2 text-xs"
          >
            <option value="H">Home</option>
            <option value="D">Draw</option>
            <option value="A">Away</option>
          </select>
          <button
            onClick={() => {
              settlePrediction(p.id, out);
              refresh();
            }}
            className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"
          >
            Settle
          </button>
        </div>
      )}
      {p.status === "SETTLED" && (
        <div className={p.correct ? "mt-3 text-positive" : "mt-3 text-destructive"}>
          {p.correct ? "CORRECT" : "INCORRECT"} · actual {p.outcome}
        </div>
      )}
    </div>
  );
}

function Shell({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-10">
      <Link to="/" className="label-xs">
        ← HOME
      </Link>
      <header className="mt-7 border-b border-border pb-6">
        <div className="label-xs text-primary">{eyebrow}</div>
        <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
