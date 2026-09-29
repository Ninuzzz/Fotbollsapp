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
import { recordSnapshot, getSeasonTeams, awardText, migrateSnapshotRounds } from "./season";
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
        // Tabellen först: gäller den inte årets säsong kastar espnStandings, och då rörs inte heller skytteligan
        const r = await espnStandings(seasonId, season.year);
        log.push(...r.log);
        rows = r.rows;
        if (rows.some((x) => x.played > 0)) {
          const n = await espnLeaders(seasonId, season.year);
          log.push(`ESPN: ${n} spelare i skytte-/assistligan uppdaterade`);
        }
      }
      if (rows.length !== teamCount) throw new Error(`Tabellen innehöll ${rows.length} av ${teamCount} lag – kontrollera lagen under Admin → Lag`);
      used = provider;
      break;
    } catch (e) {
      log.push(`${provider} misslyckades: ${(e as Error).message}`);
      rows = null;
    }
  }
  const stamp = (ok: boolean) =>
    db.setting.upsert({
      where: { key: "lastSync" },
      create: { key: "lastSync", value: JSON.stringify({ at: new Date().toISOString(), provider: used, ok, log: log.slice(-4) }) },
      update: { value: JSON.stringify({ at: new Date().toISOString(), provider: used, ok, log: log.slice(-4) }) },
    });
  if (!rows || !used) {
    await stamp(false);
    return { ok: false, log };
  }

  const photos = await fillPlayerPhotos(seasonId).catch(() => ({ checked: 0, found: 0 }));
  if (photos.checked) log.push(`Foton: ${photos.found} av ${photos.checked} hittade`);

  const r = await applyStandings(seasonId, rows, "API");
  log.push(r.message);
  await stamp(true);
  return { ok: true, log };
}

/**
 * Sparar en ny tabell och bestämmer vilka notiser som ska ut. Samma regler för synk och manuell uppdatering:
 *  - ingen tabell alls innan någon match är spelad (annars "omgång 0" till alla)
 *  - en notis per FÄRDIGSPELAD omgång – inte en per timme när helgens matcher spelas
 *  - admin får en påminnelse en gång när sista omgången är spelad
 * `notify` (manuell uppdatering): admin väljer själv, men en omgång aviseras ändå aldrig två gånger.
 */
export async function applyStandings(seasonId: string, rows: StandingRowInput[], source: "API" | "MANUAL", notify = true) {
  if (!rows.some((r) => r.played > 0)) return { recorded: false, announced: false, message: "Serien har inte startat – ingen tabell sparad" };
  await migrateSnapshotRounds();
  const season = await db.season.findUniqueOrThrow({ where: { id: seasonId } });
  const result = await recordSnapshot(seasonId, rows, source);
  if (!result.changed) return { recorded: false, announced: false, message: "Tabellen oförändrad sedan förra synken" };
  const round = result.snapshot.round;

  const key = `announcedRound:${seasonId}`;
  const last = Number((await db.setting.findUnique({ where: { key } }))?.value ?? 0);
  let announced = false;
  if (notify && round > 0 && round > last) {
    await announceUpdate(seasonId, round, result.awards);
    await db.setting.upsert({ where: { key }, create: { key, value: String(round) }, update: { value: String(round) } });
    announced = true;
  }

  const doneKey = `seasonComplete:${seasonId}`;
  if (round >= season.totalRounds && !season.isFinished && !(await db.setting.findUnique({ where: { key: doneKey } }))) {
    await sendNotification({
      type: "GENERAL",
      audience: "ADMIN",
      title: "Sista omgången är spelad 🏁",
      body: "Kontrollera slutställningen och tryck Avsluta säsong under Admin → Tävlingar. Då får alla veta vem som vann.",
      link: "/admin/tavlingar",
      seasonId,
    });
    await db.setting.create({ data: { key: doneKey, value: new Date().toISOString() } });
  }
  return { recorded: true, announced, message: `Ny tabell sparad (omgång ${round})${announced ? " – notis skickad" : ""}` };
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

/**
 * Spelarfoton från API-Football. Trupplistan (/players/squads) tar inget säsongsargument och fungerar därför
 * på gratisplanen, med foto på varje spelare. Kostar 16 anrop (ett per lag) + högst 2 första gången för att
 * koppla ihop lagen. Fyller bara spelare som saknar foto – manuellt inlagda bilder skrivs aldrig över.
 */
export async function syncPhotosFromApiFootball(seasonId: string) {
  if (!process.env.API_FOOTBALL_KEY) return { teams: 0, found: 0, log: ["API_FOOTBALL_KEY saknas"] };
  const { coreTeamName, isSeniorMenTeam, matchPlayerName } = await import("./name-match");
  const teams = await getSeasonTeams(seasonId);
  const log: string[] = [];

  // 1. Koppla våra lag till API-Footballs lag-id (en gång – sparas på laget)
  const unlinked = teams.filter((t) => !t.apiTeamId);
  if (unlinked.length) {
    const pool: { id: number; name: string }[] = [];
    // Allsvenskan + Superettan 2024 (tillgängliga på gratisplanen) täcker lagen i årets serie
    for (const league of [113, 114]) {
      try {
        const r = await af<{ team: { id: number; name: string } }[]>(`/teams?league=${league}&season=2024`);
        pool.push(...r.map((x) => x.team));
      } catch (e) {
        log.push(`lagsökning liga ${league}: ${(e as Error).message}`);
      }
    }
    for (const t of unlinked) {
      const ours = coreTeamName(t.name);
      const senior = pool.filter((p) => isSeniorMenTeam(p.name));
      // Exakt kärnnamn först, annars att det ena börjar med det andra ("AIK" ↔ "AIK Stockholm")
      let hit = senior.filter((p) => coreTeamName(p.name) === ours);
      if (!hit.length) hit = senior.filter((p) => coreTeamName(p.name).startsWith(`${ours} `) || ours.startsWith(`${coreTeamName(p.name)} `));
      if (hit.length === 1) {
        await db.team.update({ where: { id: t.id }, data: { apiTeamId: hit[0]!.id } });
        t.apiTeamId = hit[0]!.id;
      } else log.push(`hittade inte ${t.name} hos API-Football`);
    }
  }

  // 2. Trupplistor med foton → spelare som saknar bild
  let found = 0;
  let linked = 0;
  const linkedTeams = teams.filter((x) => x.apiTeamId);
  for (const [i, t] of linkedTeams.entries()) {
    // Gratisplanen tillåter ~10 anrop per minut – annars svarar API:et 429 för resten av lagen
    if (i > 0) await new Promise((r) => setTimeout(r, 7_000));
    try {
      const r = await af<{ players: { id: number; name: string; photo: string | null }[] }[]>(`/players/squads?team=${t.apiTeamId}`);
      const ours = await db.player.findMany({ where: { seasonId, teamId: t.id } });
      for (const p of r[0]?.players ?? []) {
        const me = matchPlayerName(p.name, ours);
        if (!me) continue;
        linked++;
        const data: { apiPlayerId?: number; photoUrl?: string } = {};
        if (!me.apiPlayerId) data.apiPlayerId = p.id;
        if (!me.photoUrl && p.photo?.startsWith("https://")) {
          data.photoUrl = p.photo;
          found++;
        }
        if (Object.keys(data).length) await db.player.update({ where: { id: me.id }, data });
      }
    } catch (e) {
      log.push(`${t.name}: ${(e as Error).message}`);
    }
  }
  log.unshift(`API-Football: ${found} nya foton (${linked} spelare matchade i ${linkedTeams.length} lag)`);
  await db.setting.upsert({ where: { key: "afPhotosAt" }, create: { key: "afPhotosAt", value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
  return { teams: teams.length, found, log };
}

/** Trupper, så att det finns spelare att välja som skytt/assistkung. Lagen kopplas via ESPN:s laglista (fungerar före seriestart). */
export async function syncSquads(seasonId: string) {
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
