import type { FreeLeague, MatchRow } from "./intelligence";
import { kickoffKenya } from "./intelligence";

function todayKenya() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateKey(value: string) {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return value;
  const year = m[3].length === 2 ? Number(m[3]) + 2000 : Number(m[3]);
  return `${year.toString().padStart(4, "0")}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function kickoffInstant(match: MatchRow) {
  const kenya = kickoffKenya(match);
  if (!kenya) return undefined;
  const m = kenya.match(/^(\d{4}-\d{2}-\d{2})(?:\+1)? (\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const day = m[1];
  const shifted = kenya.includes("+1");
  const isoDay = shifted ? new Date(`${day}T12:00:00Z`) : undefined;
  if (isoDay) isoDay.setUTCDate(isoDay.getUTCDate() + 1);
  const finalDay = isoDay ? isoDay.toISOString().slice(0, 10) : day;
  return new Date(`${finalDay}T${m[2]}:${m[3]}:00+03:00`).getTime();
}

export function getUpcomingFixtures(all: FreeLeague[], limit = 18) {
  const now = Date.now();
  const today = todayKenya();
  const items = all.flatMap((group) => group.matches
    .filter((match) => match.hg === undefined && match.ag === undefined)
    .filter((match) => dateKey(match.date) >= today)
    .map((match) => ({ ...match, league: group.league, code: group.code, season: group.season }))
  );

  return items
    .filter((match) => {
      const kickoff = kickoffInstant(match);
      if (kickoff !== undefined) return kickoff >= now - 5 * 60_000;
      // A future fixture without a published kickoff remains visible rather than disappearing.
      return dateKey(match.date) > today || dateKey(match.date) === today;
    })
    .sort((a, b) => {
      const ak = kickoffInstant(a) ?? new Date(`${dateKey(a.date)}T23:59:00+03:00`).getTime();
      const bk = kickoffInstant(b) ?? new Date(`${dateKey(b.date)}T23:59:00+03:00`).getTime();
      return ak - bk;
    })
    .slice(0, limit);
}
