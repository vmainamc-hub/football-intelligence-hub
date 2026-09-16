import type { FootballExpertPanel } from "@/lib/gfi/football-expert-panel";

type Props = { panel?: FootballExpertPanel };

const tone = (value: string) =>
  value === "PASS" || value === "SUPPORT" || value === "COHERENT" || value === "NORMAL"
    ? "text-emerald-500"
    : value === "FAIL" || value === "REVALIDATE" || value === "SEVERE_TENSION" || value === "SEVERE"
      ? "text-red-500"
      : "text-amber-500";

export function FootballExpertCouncil({ panel }: Props) {
  if (!panel) return null;

  return (
    <section className="mt-6 panel border-primary/30 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="label-xs text-primary">FOOTBALL EXPERT COUNCIL</div>
          <h2 className="mt-2 text-2xl font-semibold">Five experts debate the model result</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            This council interrogates the quantitative result using team strength, tactics, competition context,
            identity and contradiction analysis. It cannot rewrite probabilities or replace the authoritative engine.
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div className={panel.status === "ACTIVE" ? "font-semibold text-emerald-500" : "font-semibold text-amber-500"}>
            {panel.status} · {panel.provider}
          </div>
          <div className="mt-1">{panel.model}</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-border bg-card p-3">
          <div className="label-xs">IDENTITY CHECK</div>
          <div className={`mt-1 font-semibold ${tone(panel.identityCheck.status)}`}>{panel.identityCheck.status}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            Home {panel.identityCheck.homeConfidence}% · Away {panel.identityCheck.awayConfidence}% · Competition {panel.identityCheck.competitionConfidence}%
          </div>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <div className="label-xs">FOOTBALL REALITY</div>
          <div className={`mt-1 font-semibold ${tone(panel.realityCheck.status)}`}>{panel.realityCheck.status}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">Reality score {panel.realityCheck.score}/100</div>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <div className="label-xs">CHAIR DECISION</div>
          <div className={`mt-1 font-semibold ${tone(panel.chair.decision)}`}>{panel.chair.decision}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">Severity {panel.chair.severity}</div>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <div className="label-xs">MODEL MARKET</div>
          <div className="mt-1 font-semibold">{panel.marketReview.selectedMarket || "Not supplied"}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">Panel view only — no override</div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {panel.panel.map((expert) => (
          <article key={`${expert.role}-${expert.name}`} className="rounded border border-border bg-card p-4">
            <div className="label-xs text-primary">{expert.role}</div>
            <div className="mt-1 font-semibold">{expert.name}</div>
            <p className="mt-3 text-sm leading-6">{expert.assessment}</p>
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Concern:</span> {expert.concern}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Question:</span> {expert.question}
            </div>
          </article>
        ))}
      </div>

      {panel.debate.length > 0 && (
        <div className="mt-5 rounded border border-border bg-card p-4">
          <div className="label-xs text-primary">THE PANEL ROOM</div>
          <div className="mt-3 space-y-3">
            {panel.debate.map((turn, index) => (
              <div key={`${turn.speaker}-${index}`} className="border-l-2 border-primary/40 pl-3 text-sm leading-6">
                <div className="text-xs font-semibold text-primary">{turn.speaker}</div>
                <div className="mt-1">{turn.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded border border-primary/20 bg-primary/5 p-4">
          <div className="label-xs text-primary">CHAIR'S SYNTHESIS</div>
          <p className="mt-2 text-sm leading-6 font-medium">{panel.chair.summary}</p>
          <div className="mt-4 grid gap-3 text-xs">
            <div><span className="font-semibold">Strongest case:</span> {panel.chair.strongestCase}</div>
            <div><span className="font-semibold">Strongest countercase:</span> {panel.chair.strongestCountercase}</div>
            <div><span className="font-semibold">Unresolved question:</span> {panel.chair.unresolvedQuestion}</div>
            {panel.chair.revalidationReason && (
              <div className="rounded border border-amber-500/20 bg-amber-500/10 p-2 text-amber-500">
                Revalidation: {panel.chair.revalidationReason}
              </div>
            )}
          </div>
        </div>
        <div className="rounded border border-border bg-card p-4">
          <div className="label-xs text-primary">TEAM-STRENGTH READ</div>
          <div className="mt-3 space-y-3 text-sm">
            <div><span className="font-semibold">Home:</span> {panel.teamStrength.home.relative} — {panel.teamStrength.home.rationale}</div>
            <div><span className="font-semibold">Away:</span> {panel.teamStrength.away.relative} — {panel.teamStrength.away.rationale}</div>
          </div>
          {panel.realityCheck.flags.length > 0 && (
            <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              <div className="font-semibold text-foreground">Reality flags</div>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {panel.realityCheck.flags.map((flag, i) => <li key={i}>{flag}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 text-[11px] text-muted-foreground border-t border-border pt-3">
        AI is an interrogation and football-context layer. The deterministic quantitative engine remains the sole authority for probabilities and market selection.
      </div>
    </section>
  );
}
