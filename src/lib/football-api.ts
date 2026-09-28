/**
 * Automatisk hämtning av tabell, skytteliga och assistliga – så att Anders slipper mata in dem.
 *
 * Källor (FOOTBALL_PROVIDER):
 *  - "espn" (standard): ESPN:s publika API, ingen nyckel krävs.
 *  - "api-football": api-sports.io (kräver API_FOOTBALL_KEY). Obs: gratisnivån har historiskt
 *    bara gett tillgång till äldre säsonger – faller därför automatiskt tillbaka till ESPN vid fel.
 * Spelarfoton: TheSportsDB (exakt namnmatchning). Manuell inmatning i admin fungerar alltid som reserv.
 */
import { db } from "./db";
import { matchTeam } from "./teams-data";
import { recordSnapshot, getSeasonTeams, awardText } from "./season";
import { sendNotification } from "./notify";
import { espnLeaders, espnSquads, espnStandings, fillPlayerPhotos, type StandingRowInput } from "./espn";

const AF_BASE = process.env.API_FOOTBALL_BASE ?? "https://v3.football.api-sports.io";

export type Provider = "espn" | "api-football";

export function providerOrder(): Provider[] {
  const wanted = (process.env.FOOTBALL_PROVIDER ?? "espn") as Provider;
  if (wanted === "api-football" && process.env.API_FOOTBALL_KEY) return ["api-football", "espn"];
  return ["espn"];
}

/** Automatisk synk är alltid möjlig (ESPN kräver ingen nyckel) */
export const footballApiEnabled = () => true;

// ─── API-Football ─────────────────────────────────────────────────────────

async function af<T>(path: string): Promise<T> {
  const res = await fetch(`${AF_BASE}${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY ?? "" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`API-Football ${res.status}`);
  const json = (await res.json()) as { response: T; errors?: unknown };
  if (json.errors && Object.keys(json.errors as object).length) throw new Error(`API-Football: ${JSON.stringify(json.errors).slice(0, 200)}`);
  return json.response;
}

type AfStanding = {
  rank: number;
  team: { id: number; name: string; logo: string };
  points: number;
  form: string | null;
  all: { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } };
};
type AfPlayer = {
  player: { id: number; name: string; lastname?: string; photo: string };
  statistics: { team: { id: number; name: string }; goals: { total: number | null; assists: number | null } }[];
};

async function apiFootball(seasonId: string, leagueId: number, year: number) {
  const teams = await getSeasonTeams(seasonId);
  const log: string[] = [];
  const resp = await af<{ league: { standings: AfStanding[][] } }[]>(`/standings?league=${leagueId}&season=${year}`);
  const table = resp[0]?.league.standings[0] ?? [];
  if (!table.length) throw new Error("API-Football: tom tabell (gratisnivån saknar kanske denna säsong)");
  const byApi = new Map<number, (typeof teams)[number]>();
  const rows: StandingRowInput[] = [];
  for (const s of table) {
    const team = teams.find((t) => t.apiTeamId === s.team.id) ?? matchTeam(s.team.name, teams);
    if (!team) {
      log.push(`Kunde inte matcha "${s.team.name}"`);
      continue;
    }
    byApi.set(s.team.id, team);
    if (team.apiTeamId !== s.team.id || !team.logoUrl)
      await db.team.update({ where: { id: team.id }, data: { apiTeamId: s.team.id, logoUrl: team.logoUrl ?? s.team.logo } });
    rows.push({
      teamId: team.id,
      position: s.rank,
      played: s.all.played,
      won: s.all.win,
      drawn: s.all.draw,
      lost: s.all.lose,
      goalsFor: s.all.goals.for,
      goalsAgainst: s.all.goals.against,
      points: s.points,
      form: s.form ?? "",
    });
  }
  for (const kind of ["topscorers", "topassists"] as const) {
    const list = await af<AfPlayer[]>(`/players/${kind}?league=${leagueId}&season=${year}`);
    for (const p of list) {
      const st = p.statistics[0];
      const team = st && (byApi.get(st.team.id) ?? matchTeam(st.team.name, teams));
      if (!team) continue;
      const data = { goals: st.goals.total ?? 0, assists: st.goals.assists ?? 0, photoUrl: p.player.photo, apiPlayerId: p.player.id, teamId: team.id };
      const existing =
        (await db.player.findFirst({ where: { seasonId, apiPlayerId: p.player.id } })) ??
        (await db.player.findFirst({ where: { seasonId, teamId: team.id, name: { contains: p.player.lastname ?? p.player.name } } }));
      if (existing) await db.player.update({ where: { id: existing.id }, data });
      else await db.player.create({ data: { ...data, seasonId, name: p.player.name } });
    }
    log.push(`${kind}: ${list.length} spelare`);
  }
  return { rows, log };
}

// ─── Gemensam synk ────────────────────────────────────────────────────────

export async function syncFromApi(seasonId: string) {
  const season = await db.season.findUniqueOrThrow({ where: { id: seasonId } });
  const teamCount = (await getSeasonTeams(seasonId)).length;
  const log: string[] = [];
  let rows: StandingRowInput[] | null = null;
  let used: Provider | null = null;

  for (const provider of providerOrder()) {
    try {
      if (provider === "api-football") {
        const r = await apiFootball(seasonId, season.apiLeagueId, season.year);
        log.push(...r.log);
        rows = r.rows;
      } else {
        // Spelarstatistik först, så att tie-breakers räknas på färska siffror
        const n = await espnLeaders(seasonId);
        log.push(`ESPN: ${n} spelare i skytte-/assistligan uppdaterade`);
        const r = await espnStandings(seasonId, season.year);
        log.push(...r.log);
        rows = r.rows;
      }
      if (rows.length !== teamCount) throw new Error(`Tabellen innehöll ${rows.length} av ${teamCount} lag`);
      used = provider;
      break;
    } catch (e) {
      log.push(`${provider} misslyckades: ${(e as Error).message}`);
      rows = null;
    }
  }
  if (!rows || !used) return { ok: false, log };

  const photos = await fillPlayerPhotos(seasonId).catch(() => ({ checked: 0, found: 0 }));
  if (photos.checked) log.push(`Foton: ${photos.found} av ${photos.checked} hittade`);

  const result = await recordSnapshot(seasonId, rows, "API");
  log.push(result.changed ? `Ny tabell sparad från ${used} (omgång ${result.snapshot.round})` : "Tabellen oförändrad sedan förra synken");
  if (result.changed) await announceUpdate(seasonId, result.snapshot.round, result.awards);
  await db.setting.upsert({
    where: { key: "lastSync" },
    create: { key: "lastSync", value: JSON.stringify({ at: new Date().toISOString(), provider: used }) },
    update: { value: JSON.stringify({ at: new Date().toISOString(), provider: used }) },
  });
  return { ok: true, log };
}

/** Skickar notiser efter en uppdatering: resultat + veckans utmärkelser. */
export async function announceUpdate(seasonId: string, round: number, awards: Parameters<typeof awardText>[0][]) {
  await sendNotification({
    type: "RESULTS",
    title: `Tipstabellen uppdaterad – omgång ${round}`,
    body: "Kolla hur du ligger till efter omgångens matcher.",
    link: "/tipstabell",
    seasonId,
  });
  if (awards.length) {
    await sendNotification({
      type: "AWARD",
      title: `Veckans utmärkelser – omgång ${round}`,
      body: awards.map(awardText).join("\n"),
      link: "/tipstabell#utmarkelser",
      seasonId,
    });
  }
}

/** Trupper, så att det finns spelare att välja som skytt/assistkung inför säsongen. */
export async function syncSquads(seasonId: string) {
  const teams = await getSeasonTeams(seasonId);
  if (!teams.some((t) => t.espnId)) {
    const season = await db.season.findUniqueOrThrow({ where: { id: seasonId } });
    await espnStandings(seasonId, season.year); // kopplar ESPN-id till lagen
  }
  return espnSquads(seasonId);
}

/** Testar API-Football-nyckeln mot aktuell säsong (för admin) */
export async function testApiFootball(year: number, leagueId: number) {
  if (!process.env.API_FOOTBALL_KEY) return "API_FOOTBALL_KEY saknas.";
  try {
    const status = await af<{ subscription?: { plan: string }; requests?: { current: number; limit_day: number } }>("/status");
    const t = await af<{ league: { standings: unknown[][] } }[]>(`/standings?league=${leagueId}&season=${year}`);
    const n = t[0]?.league.standings[0]?.length ?? 0;
    return `Plan: ${status.subscription?.plan ?? "?"} · anrop idag ${status.requests?.current}/${status.requests?.limit_day} · tabell ${year}: ${n ? `${n} lag – fungerar!` : "tom (säsongen ingår inte i planen)"}`;
  } catch (e) {
    return `Fel: ${(e as Error).message}`;
  }
}
