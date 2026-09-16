import { useState } from "react";
import type { FootballExpertPanel, CouncilDiagnosticAttempt } from "@/lib/gfi/football-expert-panel";
import { ChevronDown, ChevronUp, Server, Activity, ShieldAlert, CheckCircle2 } from "lucide-react";

type Props = { panel?: FootballExpertPanel };
const tone = (value: string) => value === "PASS" || value === "SUPPORT" || value === "COHERENT" || value === "NORMAL" ? "text-emerald-500" : value === "FAIL" || value === "REVALIDATE" || value === "SEVERE_TENSION" || value === "SEVERE" ? "text-red-500" : "text-amber-500";

export function FootballExpertCouncil({ panel }: Props) {
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  if (!panel) return null;
  const call = panel.analystCall;
  const unavailable = panel.executionState ? panel.executionState !== "AVAILABLE" : panel.status !== "ACTIVE";
  const attempts: CouncilDiagnosticAttempt[] = panel.diagnostics?.attempts || [];
  const primaryModel = attempts[0]?.model || (panel.fallbackModelUsed ? "gemini-3.8-flash" : panel.model);
  const fallbackModel = panel.fallbackModelUsed ? panel.model : "gemini-3.6-flash";
  const failureReason = panel.chair?.summary || panel.chair?.revalidationReason || (panel.diagnostics?.finalStatus === "CONFIGURATION_MISSING" ? "Gemini API key not configured in server environment" : "Gemini requests failed after retries; validated quantitative selection preserved");

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
          <div className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>AI COUNCIL UNAVAILABLE — QUANTITATIVE FALLBACK</span>
          </div>
          <div className="mt-2 text-xs">
            <span className="font-semibold text-foreground">Reason: </span>
            <span className="text-muted-foreground">{failureReason}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">The result shown below is the validated quantitative selection. Identity confidence, team strength and football-reality score are <span className="font-semibold text-foreground">not assessed</span> in this run.</div>
        </div>
      )}

      {call && (
        <div className="mt-6 rounded-xl border-2 border-primary/40 bg-card p-6 shadow-sm">
          {/* Top Bar: Title & Divergence Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <span className="label-xs text-primary font-bold tracking-wider">
                {unavailable ? "QUANTITATIVE FALLBACK CALL" : "AI FOOTBALL ANALYST"}
              </span>
              {!unavailable && (
                <span className="text-[11px] text-muted-foreground">· Decision Layer Active</span>
              )}
            </div>
            {!unavailable && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-medium">COUNCIL STATE:</span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    panel.divergenceState === "DIVERGE"
                      ? "bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400"
                      : panel.divergenceState === "AGREE"
                        ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                        : panel.divergenceState === "REVALIDATE"
                          ? "bg-red-500/15 border-red-500/30 text-red-600 dark:text-red-400"
                          : "bg-muted border-border text-muted-foreground"
                  }`}
                >
                  {panel.divergenceState || (call.divergenceFromQuantitativeLeader ? "DIVERGE" : "AGREE")}
                </span>
              </div>
            )}
          </div>

          {/* Main Grid: AI Analyst Call & Supporting Metrics */}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            {/* Column 1: AI Analyst Call */}
            <div className="lg:col-span-2 space-y-3">
              <div className="label-xs text-muted-foreground">AI ANALYST CALL</div>
              <div className="flex flex-wrap items-baseline gap-3">
                <h3 className="text-3xl font-extrabold tracking-tight text-foreground">
                  {call.selection}
                </h3>
                {call.callType && call.callType !== "OTHER" && (
                  <span className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                    {call.callType.replace(/_/g, " ")}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div>
                  <span className="font-semibold text-foreground">Conviction:</span>{" "}
                  <span
                    className={
                      call.conviction === "HIGH" || call.conviction === "VERY_HIGH"
                        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                        : "text-foreground"
                    }
                  >
                    {call.conviction}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-foreground">Evidence Quality:</span>{" "}
                  {call.evidenceQuality}
                </div>
                {call.quantitativeProbability > 0 && (
                  <div>
                    <span className="font-semibold text-foreground">Selection Probability:</span>{" "}
                    {call.quantitativeProbability}%
                  </div>
                )}
              </div>

              {/* Football conclusion */}
              <div className="mt-3 rounded-lg border border-border/80 bg-muted/30 p-3.5">
                <div className="label-xs text-primary font-semibold mb-1">FOOTBALL CONCLUSION</div>
                <p className="text-sm leading-6 text-foreground">{call.rationale}</p>
              </div>
            </div>

            {/* Column 2: Quantitative Leader & Safe Alternative */}
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <div>
                <div className="label-xs text-muted-foreground">QUANTITATIVE LEADER</div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="font-bold text-foreground text-base">
                    {call.quantitativeLeader}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {call.quantitativeLeaderProbability ?? call.quantitativeProbability}% model
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Mathematical model baseline from quantitative probability engine.
                </div>
              </div>

              <div className="border-t border-border pt-3">
                <div className="label-xs text-primary font-semibold">SAFE ALTERNATIVE</div>
                <div className="mt-1 font-bold text-foreground text-sm">
                  {call.safeAlternative || call.quantitativeLeader}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {call.divergenceFromQuantitativeLeader
                    ? "Preserved raw quantitative leader as safer non-directional option."
                    : "Secondary market if preferred over primary call."}
                </div>
              </div>
            </div>
          </div>

          {/* Divergence Reason Box */}
          {call.divergenceFromQuantitativeLeader && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs leading-5 text-amber-900 dark:text-amber-200">
              <div className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                <span>COUNCIL DIVERGED FROM RAW MODEL LEADER</span>
                {call.divergenceReasonCode && (
                  <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono">
                    {call.divergenceReasonCode}
                  </span>
                )}
              </div>
              <div className="mt-1">{call.divergenceReason}</div>
            </div>
          )}

          {call.secondaryCall && (
            <div className="mt-3 text-xs text-muted-foreground">
              Secondary consideration:{" "}
              <span className="font-semibold text-foreground">{call.secondaryCall}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">IDENTITY CHECK</div>{unavailable ? <div className="mt-1 font-semibold text-amber-500">NOT ASSESSED</div> : <><div className={`mt-1 font-semibold ${tone(panel.identityCheck.status)}`}>{panel.identityCheck.status}</div><div className="mt-2 text-[11px] text-muted-foreground">Home {panel.identityCheck.homeConfidence}% · Away {panel.identityCheck.awayConfidence}% · Competition {panel.identityCheck.competitionConfidence}%</div></>}</div>
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">FOOTBALL REALITY</div>{unavailable ? <div className="mt-1 font-semibold text-amber-500">NOT ASSESSED</div> : <><div className={`mt-1 font-semibold ${tone(panel.realityCheck.status)}`}>{panel.realityCheck.status}</div><div className="mt-2 text-[11px] text-muted-foreground">{panel.realityCheck.score !== undefined ? `Reality score ${panel.realityCheck.score}/100` : "Evidence coherence verified"}</div></>}</div>
        <div className="rounded border border-border bg-card p-3"><div className="label-xs">CHAIR DECISION</div><div className={`mt-1 font-semibold ${unavailable ? "text-amber-500" : tone(panel.chair.decision)}`}>{unavailable ? "NOT EXECUTED" : panel.chair.decision}</div><div className="mt-2 text-[11px] text-muted-foreground">{unavailable ? "AI chair did not run" : `Severity ${panel.chair.severity}`}</div></div>
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

        {panel.contrarianChallenge && (
          <div className="mt-5 rounded border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
              <div className="label-xs text-primary font-bold">CONTRARIAN CHALLENGE · QUANTITATIVE LEADER UNDER TEST</div>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {panel.contrarianChallenge.verdict}
              </span>
            </div>
            <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
              <div>
                <div className="font-semibold text-foreground">Quantitative Leader Challenged:</div>
                <div className="mt-0.5 text-muted-foreground">{panel.contrarianChallenge.quantitativeLeaderChallenged}</div>
                <div className="mt-2 font-semibold text-foreground">Challenge Question:</div>
                <div className="mt-0.5 text-muted-foreground">{panel.contrarianChallenge.challengeQuestion}</div>
              </div>
              <div>
                <div className="font-semibold text-foreground">Strongest Alternative Football Argument:</div>
                <div className="mt-0.5 text-muted-foreground">{panel.contrarianChallenge.strongestAlternative} — {panel.contrarianChallenge.evidenceForAlternative}</div>
                <div className="mt-2 font-semibold text-foreground">Chair's Evaluation of Challenge:</div>
                <div className="mt-0.5 text-muted-foreground">{panel.contrarianChallenge.chairResponse}</div>
              </div>
            </div>
          </div>
        )}

        {panel.debate.length > 0 && <div className="mt-5 rounded border border-border bg-card p-4"><div className="label-xs text-primary">THE PANEL ROOM · CHALLENGE & RESPONSE</div><div className="mt-3 space-y-4">{panel.debate.map((turn, index) => <div key={`${turn.speaker}-${index}`} className="border-l-2 border-primary/40 pl-3 text-sm leading-6"><div className="text-xs font-semibold text-primary">{turn.speaker}</div><div className="mt-1"><span className="font-semibold">Challenge:</span> {turn.challenges}</div><div className="mt-1 text-muted-foreground"><span className="font-semibold text-foreground">Response:</span> {turn.response}</div></div>)}</div></div>}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded border border-primary/20 bg-primary/5 p-4"><div className="label-xs text-primary">CHAIR'S SYNTHESIS</div><p className="mt-2 text-sm leading-6 font-medium">{panel.chair.summary}</p><div className="mt-4 grid gap-3 text-xs"><div><span className="font-semibold">Strongest case:</span> {panel.chair.strongestCase}</div><div><span className="font-semibold">Strongest countercase:</span> {panel.chair.strongestCountercase}</div><div><span className="font-semibold">Unresolved question:</span> {panel.chair.unresolvedQuestion}</div>{panel.chair.revalidationReason && <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-amber-500">Revalidation: {panel.chair.revalidationReason}</div>}</div></div>
          <div className="rounded border border-border bg-card p-4"><div className="label-xs text-primary">TEAM-STRENGTH READ</div><div className="mt-3 space-y-3 text-sm"><div><span className="font-semibold">Home:</span> {panel.teamStrength.home.relative} — {panel.teamStrength.home.rationale}</div><div><span className="font-semibold">Away:</span> {panel.teamStrength.away.relative} — {panel.teamStrength.away.rationale}</div><div><span className="font-semibold">Strength gap:</span> {panel.teamStrength.strengthGap}</div><div><span className="font-semibold">Opponent-quality adjustment:</span> {panel.teamStrength.opponentQualityAdjustment}</div></div>{panel.realityCheck.flags.length > 0 && <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground"><div className="font-semibold text-foreground">Reality flags</div><ul className="mt-2 list-disc space-y-1 pl-4">{panel.realityCheck.flags.map((flag, i) => <li key={i}>{flag}</li>)}</ul></div>}</div>
        </div>
      </>}

      {/* Production Safe Diagnostics Section */}
      <div className="mt-5 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowDiagnostics((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
        >
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold uppercase tracking-wider text-[11px]">AI Execution Diagnostics</span>
            <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-mono">
              Provider: {panel.provider} · Status: {panel.status}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px]">
            <span>{showDiagnostics ? "Hide Details" : "View Attempt Details"}</span>
            {showDiagnostics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </div>
        </button>

        {showDiagnostics && (
          <div className="mt-3 rounded-lg border border-border bg-card p-4 text-xs space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pb-2 border-b border-border/60">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Provider</div>
                <div className="mt-0.5 font-mono font-semibold">{panel.provider}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Primary Model</div>
                <div className="mt-0.5 font-mono font-semibold">{primaryModel}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Fallback Model</div>
                <div className="mt-0.5 font-mono font-semibold">{fallbackModel}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">Decision Applied</div>
                <div className="mt-0.5 font-mono font-semibold">
                  {panel.diagnostics?.decisionApplied ? "YES" : "NO"}
                </div>
              </div>
            </div>

            {attempts.length > 0 ? (
              <div className="space-y-2">
                <div className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground">
                  Execution Attempts ({attempts.length})
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {attempts.map((att) => (
                    <div
                      key={att.attempt}
                      className={`rounded border p-2.5 text-[11px] leading-5 ${
                        att.decisionApplied || att.status === 200
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>Attempt {att.attempt}: {att.model}</span>
                        <span
                          className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${
                            att.status === 200 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                          }`}
                        >
                          HTTP {att.status}
                        </span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-2 text-[10px] text-muted-foreground">
                        <div>Reached Gemini: <span className="font-medium text-foreground">{att.reachedGemini ? "YES" : "NO"}</span></div>
                        <div>Response: <span className="font-medium text-foreground">{att.responseBodyReceived ? "YES" : "NO"}</span></div>
                        <div>Parsed: <span className="font-medium text-foreground">{att.jsonParsed ? "YES" : "NO"}</span></div>
                        <div>Council Valid: <span className="font-medium text-foreground">{att.structuredOutputValid ? "YES" : "NO"}</span></div>
                        <div>Decision Applied: <span className="font-medium text-foreground">{att.decisionApplied ? "YES" : "NO"}</span></div>
                        <div>Elapsed: <span className="font-medium text-foreground">{att.elapsedMs}ms</span></div>
                      </div>
                      {att.error && (
                        <div className="mt-1.5 rounded bg-muted/60 p-1.5 font-mono text-[10px] text-muted-foreground truncate">
                          {att.error.slice(0, 120)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded bg-muted/40 p-3 text-[11px] text-muted-foreground">
                {panel.diagnostics?.finalStatus === "CONFIGURATION_MISSING" ? (
                  <div>
                    <span className="font-semibold text-amber-500">CONFIGURATION MISSING:</span> The server environment did not detect <code className="font-mono">GEMINI_API_KEY</code> or <code className="font-mono">GOOGLE_API_KEY</code>.
                    Please configure <code className="font-mono">GEMINI_API_KEY</code> in the Cloud Run service environment variables or Google AI Studio settings.
                  </div>
                ) : (
                  <div>No direct execution attempts recorded for this panel run.</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-[11px] text-muted-foreground border-t border-border pt-3">AI controls the analytical conclusion only within the computed market surface. It cannot invent a market, fabricate evidence, or alter the underlying quantitative probabilities. If identity integrity fails or the council detects severe contamination, the validated quantitative result remains the fallback.</div>
    </section>
  );
}
