/**
 * ESPN:s publika fotbolls-API (ingen nyckel krävs) – standardkälla.
 *  - Tabell + officiella laglogotyper:  /apis/v2/sports/soccer/swe.1/standings
 *  - Skytte- och assistliga (topp 50):   /apis/site/v2/sports/soccer/swe.1/statistics
 *  - Trupper:                            /apis/site/v2/sports/soccer/swe.1/teams/{id}/roster
 * Spelarfoton saknas hos ESPN för de flesta allsvenska spelare – de hämtas från TheSportsDB (se player-photos.ts).
 */
import { db } from "./db";
import { matchTeam } from "./teams-data";
import { getSeasonTeams } from "./season";
import { findPlayerPhoto } from "./player-photos";

const BASE = "https://site.api.espn.com/apis";
const LEAGUE = process.env.ESPN_LEAGUE ?? "swe.1";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ESPN ${res.status} ${path}`);
  return (await res.json()) as T;
}

type EspnTeam = { id: string; displayName: string; logos?: { href: string; rel: string[] }[] };
type EspnStandings = {
  children: { standings: { season: number; entries: { team: EspnTeam; stats: { name: string; value: number }[] }[] } }[];
};
type EspnLeader = { value: number; shortDisplayValue: string; athlete: { id: string; displayName: string; team?: EspnTeam } };
type EspnStats = { season: { year: number }; stats: { name: string; leaders: EspnLeader[] }[] };

export type StandingRowInput = {
  teamId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: string;
};

export async function espnStandings(seasonId: string, year: number) {
  const teams = await getSeasonTeams(seasonId);
  const log: string[] = [];
  const d = await get<EspnStandings>(`/v2/sports/soccer/${LEAGUE}/standings?season=${year}`);
  const st = d.children?.[0]?.standings;
  if (!st) throw new Error(`ESPN har ingen tabell för ${year} än – serien har troligen inte startat`);
  // Aldrig förra årets tabell: den skulle räknas mot årets tips och skicka notiser om "omgång 30" mitt i tippningen
  if (st.season && st.season !== year) throw new Error(`ESPN visar säsong ${st.season}, inte ${year} – serien har inte startat än`);
  const rows: StandingRowInput[] = [];
  for (const e of st.entries) {
    const team = teams.find((t) => t.espnId === Number(e.team.id)) ?? matchTeam(e.team.displayName, teams);
    if (!team) {
      log.push(`Kunde inte matcha "${e.team.displayName}" – lägg till alias under Admin → Lag`);
      continue;
    }
    const logo = e.team.logos?.find((l) => l.rel.includes("dark"))?.href ?? e.team.logos?.[0]?.href ?? null;
    if (team.espnId !== Number(e.team.id) || (!team.logoUrl && logo))
      await db.team.update({ where: { id: team.id }, data: { espnId: Number(e.team.id), logoUrl: team.logoUrl ?? logo } });
    const v = (n: string) => Math.round(e.stats.find((s) => s.name === n)?.value ?? 0);
    rows.push({
      teamId: team.id,
      position: v("rank"),
      played: v("gamesPlayed"),
      won: v("wins"),
      drawn: v("ties"),
      lost: v("losses"),
      goalsFor: v("pointsFor"),
      goalsAgainst: v("pointsAgainst"),
      points: v("points"),
      form: "",
    });
  }
  rows.sort((a, b) => a.position - b.position);
  return { rows, log };
}

/** Uppdaterar mål och assist för alla spelare i ESPN:s topplistor (upp till 50 per lista). */
export async function espnLeaders(seasonId: string, year?: number) {
  const teams = await getSeasonTeams(seasonId);
  const d = await get<EspnStats>(`/site/v2/sports/soccer/${LEAGUE}/statistics`);
  // Skytteligan saknar årsparameter hos ESPN. Gäller den ett annat år (t.ex. förra säsongen före seriestart)
  // skulle årets spelare få fjolårets mål – då rör vi ingenting.
  const statsYear = (d as { season?: { year?: number } }).season?.year;
  if (year && statsYear && statsYear !== year) return 0;
  const seen = new Map<string, { name: string; team: EspnTeam | undefined; goals: number; assists: number }>();
  for (const list of d.stats ?? []) {
    for (const l of list.leaders ?? []) {
      // shortDisplayValue: "M: 22, G: 8: A: 14" – innehåller både mål och assist
      const g = Number(/G:\s*(\d+)/.exec(l.shortDisplayValue)?.[1] ?? (list.name === "goalsLeaders" ? l.value : 0));
      const a = Number(/A:\s*(\d+)/.exec(l.shortDisplayValue)?.[1] ?? (list.name === "assistsLeaders" ? l.value : 0));
      const prev = seen.get(l.athlete.id);
      seen.set(l.athlete.id, {
        name: l.athlete.displayName,
        team: l.athlete.team,
        goals: Math.max(prev?.goals ?? 0, g),
        assists: Math.max(prev?.assists ?? 0, a),
      });
    }
  }
  let updated = 0;
  for (const [espnId, p] of seen) {
    const team = p.team ? teams.find((t) => t.espnId === Number(p.team!.id)) ?? matchTeam(p.team.displayName, teams) : undefined;
    if (!team) continue;
    const existing =
      (await db.player.findFirst({ where: { seasonId, espnId: Number(espnId) } })) ??
      (await db.player.findFirst({ where: { seasonId, teamId: team.id, name: p.name } })) ??
      // matcha på efternamn inom samma lag (t.ex. "Priske" i gamla listor)
      (await db.player.findFirst({ where: { seasonId, teamId: team.id, espnId: null, name: p.name.split(" ").at(-1)! } }));
    const data = { goals: p.goals, assists: p.assists, espnId: Number(espnId), teamId: team.id };
    if (existing) await db.player.update({ where: { id: existing.id }, data: { ...data, name: p.name } });
    else await db.player.create({ data: { ...data, seasonId, name: p.name } });
    updated++;
  }
  return updated;
}

/** Hämtar trupper (utespelare) så att det finns spelare att tippa inför säsongen. */
/**
 * Kopplar tävlingens lag till ESPN via ligans laglista. Fungerar även före seriestart (då finns ingen tabell),
 * så att nyuppflyttade lag får id och logotyp – och trupperna kan hämtas innan folk ska tippa.
 */
export async function linkEspnTeams(seasonId: string) {
  const teams = await getSeasonTeams(seasonId);
  const d = await get<{ sports?: { leagues?: { teams?: { team: EspnTeam & { logos?: { href: string; rel: string[] }[] } }[] }[] }[] }>(
    `/site/v2/sports/soccer/${LEAGUE}/teams`,
  );
  const list = d.sports?.[0]?.leagues?.[0]?.teams?.map((x) => x.team) ?? [];
  let linked = 0;
  const missing: string[] = [];
  for (const t of teams) {
    if (t.espnId) continue;
    const hit = list.find((e) => matchTeam(e.displayName, [t]));
    if (!hit) {
      missing.push(t.name);
      continue;
    }
    const logo = hit.logos?.find((l) => l.rel.includes("dark"))?.href ?? hit.logos?.[0]?.href ?? null;
    await db.team.update({ where: { id: t.id }, data: { espnId: Number(hit.id), logoUrl: t.logoUrl ?? logo } });
    linked++;
  }
  return { linked, missing };
}

export async function espnSquads(seasonId: string) {
  await linkEspnTeams(seasonId).catch(() => null);
  const teams = (await getSeasonTeams(seasonId)).filter((t) => t.espnId);
  let count = 0;
  for (const t of teams) {
    const r = await get<{ athletes?: { id: string; displayName: string; position?: { abbreviation?: string } }[] }>(
      `/site/v2/sports/soccer/${LEAGUE}/teams/${t.espnId}/roster`,
    );
    for (const a of r.athletes ?? []) {
      if (a.position?.abbreviation === "G") continue;
      const existing = await db.player.findFirst({ where: { seasonId, OR: [{ espnId: Number(a.id) }, { teamId: t.id, name: a.displayName }] } });
      if (existing) await db.player.update({ where: { id: existing.id }, data: { espnId: Number(a.id), teamId: t.id } });
      else await db.player.create({ data: { seasonId, teamId: t.id, name: a.displayName, espnId: Number(a.id) } });
      count++;
    }
  }
  return { teams: teams.length, players: count };
}

/** Letar foton till topplistornas spelare (max `limit` nya uppslag per körning). */
export async function fillPlayerPhotos(seasonId: string, limit = 20) {
  const candidates = await db.player.findMany({
    where: { seasonId, photoUrl: null, photoChecked: false, OR: [{ goals: { gt: 0 } }, { assists: { gt: 0 } }] },
    include: { team: true },
    orderBy: [{ goals: "desc" }, { assists: "desc" }],
    take: limit,
  });
  let found = 0;
  for (const p of candidates) {
    const photo = await findPlayerPhoto(p.name, p.team);
    await db.player.update({ where: { id: p.id }, data: { photoChecked: true, ...(photo ? { photoUrl: photo } : {}) } });
    if (photo) found++;
  }
  return { checked: candidates.length, found };
}
