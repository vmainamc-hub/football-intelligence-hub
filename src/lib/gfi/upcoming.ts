import type { FreeLeague, MatchRow } from "./intelligence";
import { kickoffKenya } from "./intelligence";

export type UpcomingDay = {
  date: string;
  label: string;
  matches: (MatchRow & { league: string; code: string; season: string })[];
};

function todayKenya(reference = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(reference);
}

function addDaysKey(key: string, days: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
  const m = kenya.match(/^(\d{4}-\d{2}-\d{2})(?:\+(\d+))?\s+(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const day = m[1];
  const shiftDays = m[2] ? Number(m[2]) : kenya.includes("+1") ? 1 : 0;
  const finalDay = shiftDays > 0 ? addDaysKey(day, shiftDays) : day;
  return new Date(`${finalDay}T${m[3]}:${m[4]}:00+03:00`).getTime();
}

function kenyaCalendarDate(match: MatchRow) {
  const kenya = kickoffKenya(match);
  if (kenya) {
    const m = kenya.match(/^(\d{4}-\d{2}-\d{2})(?:\+(\d+))?\s+(\d{2}):(\d{2})/);
    if (m) {
      const baseDay = m[1];
      const shiftDays = m[2] ? Number(m[2]) : kenya.includes("+1") ? 1 : 0;
      if (shiftDays > 0) {
        return addDaysKey(baseDay, shiftDays);
      }
      return baseDay;
    }
  }
  return dateKey(match.date);
}

function relativeLabel(date: string, today: string) {
  if (date === today) return "TODAY";
  if (date === addDaysKey(today, 1)) return "TOMORROW";
  if (date === addDaysKey(today, 2)) return "DAY AFTER TOMORROW";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    weekday: "long",
    day: "2-digit",
    month: "short",
  })
    .format(new Date(`${date}T12:00:00+03:00`))
    .toUpperCase();
}

export function getUpcomingFixtures(all: FreeLeague[], limit = 18) {
  return getUpcomingFixturesByDay(all, 1, limit).flatMap((group) => group.matches);
}

/**
 * Never hides a later same-day fixture merely because an earlier global batch
 * consumed the display limit. The home page uses these day buckets so marquee
 * fixtures such as cup ties remain discoverable.
 */
export function getUpcomingFixturesByDay(
  all: FreeLeague[],
  days = 7,
  perDayLimit = 80,
  referenceDate = new Date(),
): UpcomingDay[] {
  const today = todayKenya(referenceDate);
  const end = addDaysKey(today, Math.max(0, days - 1));
  const now = referenceDate.getTime();
  const byDate = new Map<string, (MatchRow & { league: string; code: string; season: string })[]>();

  for (const group of all) {
    for (const match of group.matches) {
      if (match.hg !== undefined || match.ag !== undefined) continue;
      const calendarDate = kenyaCalendarDate(match);
      if (calendarDate < today || calendarDate > end) continue;
      const kickoff = kickoffInstant(match);
      if (calendarDate === today && kickoff !== undefined && kickoff < now - 5 * 60_000) continue;
      const row = { ...match, league: group.league, code: group.code, season: group.season };
      const list = byDate.get(calendarDate) ?? [];
      list.push(row);
      byDate.set(calendarDate, list);
    }
  }

  return Array.from({ length: days }, (_, index) => addDaysKey(today, index)).map((date) => {
    const matches = (byDate.get(date) ?? [])
      .sort((a, b) => {
        const ak = kickoffInstant(a) ?? new Date(`${date}T23:59:00+03:00`).getTime();
        const bk = kickoffInstant(b) ?? new Date(`${date}T23:59:00+03:00`).getTime();
        return ak - bk;
      })
      .slice(0, perDayLimit);
    return {
      date,
      label: relativeLabel(date, today),
      matches,
    };
  });
}
