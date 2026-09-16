import type { AuthoritativeMatchAnalysis } from "./authoritative";

export type MainstreamMarket = "1X2" | "DOUBLE CHANCE" | "DRAW NO BET" | "OVER/UNDER 1.5" | "OVER/UNDER 2.5" | "OVER/UNDER 3.5" | "BTTS";
export type MarketSignal = { market: MainstreamMarket; selection: string; probability: number; confidence: number; tier: "PRIMARY" | "SECONDARY" | "WATCH"; rationale: string };
const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const pct = (n: number) => Math.round(clamp(n) * 100);
const goal = (r: AuthoritativeMatchAnalysis, k: string) => r.engines.find(e => e.id === "TOTALS")?.values?.[k];
const btts = (r: AuthoritativeMatchAnalysis) => r.engines.find(e => e.id === "BTTS")?.values?.yes;
const tier = (p: number, c: number): MarketSignal["tier"] => c < 50 ? "WATCH" : p >= 0.62 ? "PRIMARY" : p >= 0.56 ? "SECONDARY" : "WATCH";
function signal(market: MainstreamMarket, selection: string, probability: number, result: AuthoritativeMatchAnalysis, rationale: string): MarketSignal {
  const p = clamp(probability), c = clamp(result.confidence / 100) * 100;
  return { market, selection, probability: p, confidence: Math.round(c), tier: tier(p, c), rationale: `${rationale} Epistemic confidence ${Math.round(c)}%; this is evidence confidence, not event probability.` };
}
export function buildSevenMarketComparison(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  const p = result.probabilities, h = result.home.team, a = result.away.team, o15 = Number(goal(result, "over1.5")), o25 = Number(goal(result, "over2.5")), o35 = Number(goal(result, "over3.5")), b = Number(btts(result));
  return [signal("1X2", `${h} WIN`, p.home, result, `Home-win probability ${pct(p.home)}%.`), signal("1X2", "DRAW", p.draw, result, `Draw probability ${pct(p.draw)}%.`), signal("1X2", `${a} WIN`, p.away, result, `Away-win probability ${pct(p.away)}%.`), signal("OVER/UNDER 1.5", "OVER 1.5", o15, result, `Over 1.5 probability ${pct(o15)}%.`), signal("OVER/UNDER 2.5", "OVER 2.5", o25, result, `Over 2.5 probability ${pct(o25)}%.`), signal("OVER/UNDER 3.5", "UNDER 3.5", 1 - o35, result, `Under 3.5 probability ${pct(1 - o35)}%.`), signal("BTTS", "BTTS — YES", b, result, `BTTS Yes probability ${pct(b)}%.`)].filter(x => Number.isFinite(x.probability));
}
export function buildMainstreamMarketMap(result: AuthoritativeMatchAnalysis): MarketSignal[] {
  if (!result?.probabilities) return [{ market: "1X2", selection: "NO MARKET DATA", probability: 0, confidence: 0, tier: "WATCH", rationale: "No complete authoritative probability surface is available." }];
  const { home, draw, away } = result.probabilities, ht = result.home.team, at = result.away.team, winner = home >= draw && home >= away ? ht : away >= draw ? at : "DRAW";
  const out: MarketSignal[] = [signal("1X2", winner === "DRAW" ? "DRAW" : `${winner} WIN`, Math.max(home, draw, away), result, `Highest 1X2 probability ${pct(Math.max(home, draw, away))}%.`)];
  const dc = [{ selection: "1X", probability: home + draw }, { selection: "X2", probability: draw + away }, { selection: "12", probability: home + away }].sort((a, b) => b.probability - a.probability)[0];
  out.push(signal("DOUBLE CHANCE", dc.selection, dc.probability, result, `Two-result coverage ${pct(dc.probability)}%.`));
  const dnbH = home / Math.max(0.0001, home + away), dnbA = away / Math.max(0.0001, home + away);
  out.push(signal("DRAW NO BET", dnbH >= dnbA ? `DNB — ${ht}` : `DNB — ${at}`, Math.max(dnbH, dnbA), result, "Draw removed from the win comparison."));
  for (const line of [1.5, 2.5, 3.5] as const) { const o = Number(goal(result, `over${line}`)); if (!Number.isFinite(o)) continue; out.push(signal(`OVER/UNDER ${line}`, o >= 0.5 ? `OVER ${line}` : `UNDER ${line}`, Math.max(o, 1 - o), result, `Goal model probability ${pct(Math.max(o, 1 - o))}%.`)); }
  const b = Number(btts(result); if (Number.isFinite(b)) out.push(signal("BTTS", b >= 0.5 ? "BTTS — YES" : "BTTS — NO", Math.max(b, 1 - b), result, `BTTS selection probability ${pct(Math.max(b, 1 - b))}%.`));
  return out;
}
export function bestQualifiedMarket(result: AuthoritativeMatchAnalysis): MarketSignal {
  const markets = buildMainstreamMarketMap(result), insufficient = result.decision === "INSUFFICIENT INTELLIGENCE" || Number(result.aiReasoningPacket?.teamSample ?? 0) < 8 || result.aiReasoningPacket?.sparsePriorUsed === true;
  if (!markets.length || markets[0].selection === "NO MARKET DATA") return markets[0] ?? { market: "1X2", selection: "NO MARKET DATA", probability: 0, confidence: 0, tier: "WATCH", rationale: "No market observations were produced." };
  const quality = result.quality, confidence = result.confidence, robust = result.robustness.score, risk = result.risk;
  const ranked = markets.slice().sort((a, b) => { const score = (m: MarketSignal) => m.probability * 0.4 + (m.confidence / 100) * 0.25 + (robust / 100) * 0.15 + (quality / 100) * 0.2 - (risk === "HIGH" ? 0.08 : risk === "VERY HIGH" ? 0.15 : 0); return score(b) - score(a); });
  const best = ranked[0], qualified = !insufficient && best.confidence >= 60 && best.probability >= 0.57 && risk !== "VERY HIGH";
  if (!qualified) return { ...best, selection: "NO QUALIFIED ACTION", tier: "WATCH", rationale: `${best.selection} is the strongest mathematical market, but it is not qualified for action because fixture-specific evidence, epistemic confidence, or risk gates are insufficient. ${best.rationale}` };
  return { ...best, tier: best.probability >= 0.62 ? "PRIMARY" : "SECONDARY", rationale: best.rationale };
}
export function primaryMarket(result: AuthoritativeMatchAnalysis) { return buildMainstreamMarketMap(result)[0] ?? { market: "1X2", selection: "NO MARKET DATA", probability: 0, confidence: 0, tier: "WATCH" as const, rationale: "No market data." }; }
