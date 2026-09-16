import type { FootballExpertPanel } from "@/lib/gfi/football-expert-panel";

type Props = { panel?: FootballExpertPanel };
const tone = (value: string) => value === "PASS" || value === "SUPPORT" || value === "COHERENT" || value === "NORMAL" ? "text-emerald-500" : value === "FAIL" || value === "REVALIDATE" || value === "SEVERE_TENSION" || value === "SEVERE" ? "text-red-500" : "text-amber-500";

export function FootballExpertCouncil({ panel }: Props) {
  if (!panel) return null;
  const call = panel.analystCall;
  const unavailable = panel.executionState !== "AVAILABLE";
  return (
    <section className="mt-6 panel border-primary/40 p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label-xs text-primary">AI FOOTBALL ANALYST · EXPERT COUNCIL</div>
          <h2 className="mt-2 text-2xl font-semibold">Eight specialist analysts + Chair</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">The council reads the same evidence and quantitative market surface, debates the football meaning of that evidence, and can choose a different computed market when the football conclusion is more informative than the safest raw probability.</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className={panel.status === "ACTIVE" ? "font-semibold text-emerald-500" : "font-semibold text-amber-500"}>
            {panel.status === "ACTIVE" ? "ACTIVE · GEMINI" : "AI COUNCIL UNAVAILABLE — QUANTITATIVE FALLBACK · NONE"}
          </div>
          {panel.fallbackModelUsed ? (
            <div className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <span>PROVIDER FALLBACK · {panel.model}</span>
              <span className="text-[10px] text-muted-foreground font-normal">(primary model 3.8 high demand)</span>
            </div>
          ) : (
            <div className="mt-1">
              {panel.model} · {panel.architectureVersion}
              {panel.retryAttempts && panel.retryAttempts > 1 ? (
                <span className="ml-1 text-[11px] text-emerald-500 font-medium">(resolved attempt {panel.retryAttempts})</span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {unavailable && (
        <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6">
          <div className="font-semibold text-amber-600 dark:text-amber-400">AI COUNCIL UNAVAILABLE — QUANTITATIVE FALLBACK</div>
          <div className="mt-1 text-muted-foreground">The Gemini council did not complete, so the result shown below is the validated quantitative selection. Identity confidence, team strength and football-reality score are <span className="font-semibold text-foreground">not assessed</span> in this run.</div>
        </div>
      )}

      {call && (
        <div className="mt-6 rounded-xl border-2 border-primary/40 bg-primary/5 p-5">
          <div className="label-xs text-primary">{unavailable ? "QUANTITATIVE FALLBACK CALL" : "FINAL AI ANALYST CALL"}</div>
          <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div><div className="text-3xl font-bold tracking-tight">{call.selection}</div><div className="mt-2 text-xs text-muted-foreground">{call.market} · {call.conviction} conviction · {call.evidenceQuality} evidence</div></div>
            <div className="rounded border border-border bg-card px-3 py-2 text-right text-xs"><div className="label-xs text-muted-foreground">QUANTITATIVE LEADER</div><div className="mt-1 font-semibold">{call.quantitativeLeader}</div><div className="text-muted-foreground">{call.quantitativeProbability}% model probability</div></div>
          </div>
          <p className="mt-4 text-sm leading-6">{call.rationale}</p>
          {call.divergenceFromQuantitativeLeader && <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-600 dark:text-amber-400"><span className="font-semibold">COUNCIL DIVERGED FROM RAW MODEL LEADER:</span> {call.divergenceReason}</div>}
          {call.secondaryCall && <div className="mt-3 text-xs text-muted-foreground">Secondary consideration: <span className="font-semibold text-foreground">{call.secondaryCall}</span></div>}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">IDENTITY CHECK</div>{unavailable ? <div className="mt-1 font-semibold text-amber-500">NOT ASSESSED</div> : <><div className={`mt-1 font-semibold ${tone(panel.identityCheck.status)}`}>{panel.identityCheck.status}</div><div className="mt-2 text-[11px] text-muted-foreground">Home {panel.identityCheck.homeConfidence}% · Away {panel.identityCheck.awayConfidence}% · Competition {panel.identityCheck.competitionConfidence}%</div></>}</div>
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">FOOTBALL REALITY</div>{unavailable ? <div className="mt-1 font-semibold text-amber-500">NOT ASSESSED</div> : <><div className={`mt-1 font-semibold ${tone(panel.realityCheck.status)}`}>{panel.realityCheck.status}</div><div className="mt-2 text-[11px] text-muted-foreground">Reality score {panel.realityCheck.score}/100</div></>}</div>
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">CHAIR DECISION</div><div className={`mt-1 font-semibold ${tone(panel.chair.decision)}`}>{unavailable ? "NOT EXECUTED" : panel.chair.decision}</div><div className="mt-2 text-[11px] text-muted-foreground">{unavailable ? "AI chair did not run" : `Severity ${panel.chair.severity}`}</div></div>
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">COUNCIL MARKET</div><div className="mt-1 font-semibold">{panel.marketReview.selectedMarket || "Not supplied"}</div><div className="mt-2 text-[11px] text-muted-foreground">{unavailable ? "Quantitative fallback" : "Decision-layer selection"}</div></div>
      </div>

      {!unavailable && <>
        <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {panel.panel.map((expert) => (
            <article key={`${expert.role}-${expert.name}`} className="rounded border border-border bg-card p-4">
              <div className="label-xs text-primary">{expert.role}</div><div className="mt-1 font-semibold">{expert.name}</div><div className="mt-2 text-[11px] font-semibold text-muted-foreground">STANCE: {expert.stance}</div>
              <p className="mt-3 text-sm leading-6">{expert.assessment}</p>
              {expert.evidence.length > 0 && <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">{expert.evidence.slice(0, 3).map((e, i) => <li key={i}>• {e}</li>)}</ul>}
              <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Concern:</span> {expert.concern}</div>
              <div className="mt-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Question:</span> {expert.question}</div>
            </article>
          ))}
        </div>

        {panel.debate.length > 0 && <div className="mt-5 rounded border border-border bg-card p-4"><div className="label-xs text-primary">THE PANEL ROOM · CHALLENGE & RESPONSE</div><div className="mt-3 space-y-4">{panel.debate.map((turn, index) => <div key={`${turn.speaker}-${index}`} className="border-l-2 border-primary/40 pl-3 text-sm leading-6"><div className="text-xs font-semibold text-primary">{turn.speaker}</div><div className="mt-1"><span className="font-semibold">Challenge:</span> {turn.challenges}</div><div className="mt-1 text-muted-foreground"><span className="font-semibold text-foreground">Response:</span> {turn.response}</div></div>)}</div></div>}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded border border-primary/20 bg-primary/5 p-4"><div className="label-xs text-primary">CHAIR'S SYNTHESIS</div><p className="mt-2 text-sm leading-6 font-medium">{panel.chair.summary}</p><div className="mt-4 grid gap-3 text-xs"><div><span className="font-semibold">Strongest case:</span> {panel.chair.strongestCase}</div><div><span className="font-semibold">Strongest countercase:</span> {panel.chair.strongestCountercase}</div><div><span className="font-semibold">Unresolved question:</span> {panel.chair.unresolvedQuestion}</div>{panel.chair.revalidationReason && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-amber-500">Revalidation: {panel.chair.revalidationReason}</div>}</div></div>
          <div className="rounded border border-border bg-card p-4"><div className="label-xs text-primary">TEAM-STRENGTH READ</div><div className="mt-3 space-y-3 text-sm"><div><span className="font-semibold">Home:</span> {panel.teamStrength.home.relative} — {panel.teamStrength.home.rationale}</div><div><span className="font-semibold">Away:</span> {panel.teamStrength.away.relative} — {panel.teamStrength.away.rationale}</div><div><span className="font-semibold">Strength gap:</span> {panel.teamStrength.strengthGap}</div><div><span className="font-semibold">Opponent-quality adjustment:</span> {panel.teamStrength.opponentQualityAdjustment}</div></div>{panel.realityCheck.flags.length > 0 && <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground"><div className="font-semibold text-foreground">Reality flags</div><ul className="mt-2 list-disc space-y-1 pl-4">{panel.realityCheck.flags.map((flag, i) => <li key={i}>{flag}</li>)}</ul></div>}</div>
        </div>
      </>}

      <div className="mt-4 text-[11px] text-muted-foreground border-t border-border pt-3">AI controls the analytical conclusion only within the computed market surface. It cannot invent a market, fabricate evidence, or alter the underlying quantitative probabilities. If identity integrity fails or the council detects severe contamination, the validated quantitative result remains the fallback.</div>
    </section>
  );
}
