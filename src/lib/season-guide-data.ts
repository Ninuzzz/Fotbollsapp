import { db } from "./db";
import { completedRound, getLatestSnapshot, getSeasonTeams, seasonPhase, type Season } from "./season";
import { finishCheck } from "./finish";
import { espnLeagueTeams } from "./espn";
import { tableBottom, teamCheck, type TeamCheck } from "./season-admin";
import { buildSeasonGuide, type GuideState } from "./season-guide";

/** Hämtar läget för säsongsguiden. ESPN:s laglista hämtas bara inför säsongen (när lagen ska stämmas av). */
export async function loadSeasonGuideState(season: Season, now = new Date()): Promise<GuideState> {
  const phase = seasonPhase(season, now);
  const [snapshot, finish, archived, hero, prevHero, next, teams, playerCount, entries, bottom] = await Promise.all([
    getLatestSnapshot(season.id),
    finishCheck(season.id),
    db.historicalResult.count({ where: { year: season.year } }),
    db.hallOfFame.findUnique({ where: { year: season.year }, select: { consent: true } }),
    db.hallOfFame.findUnique({ where: { year: season.year - 1 }, select: { consent: true } }),
    db.season.findUnique({ where: { year: season.year + 1 }, select: { id: true } }),
    getSeasonTeams(season.id),
    db.player.count({ where: { seasonId: season.id } }),
    db.entry.findMany({ where: { seasonId: season.id }, select: { paymentStatus: true, freeEntry: true, submittedAt: true } }),
    tableBottom(season.id),
  ]);

  let teamState: TeamCheck = { status: "ok" };
  if (phase === "TIPPING") {
    const prev = await db.season.findUnique({ where: { year: season.year - 1 }, select: { id: true } });
    const prevIds = prev ? (await db.seasonTeam.findMany({ where: { seasonId: prev.id }, select: { teamId: true } })).map((t) => t.teamId) : [];
    const espn = await espnLeagueTeams().catch(() => null);
    teamState = await teamCheck(season.id, espn, prevIds);
  }

  const confirmed = entries.filter((e) => e.paymentStatus === "CONFIRMED" || e.freeEntry);
  return {
    now,
    season,
    phase,
    round: snapshot ? completedRound(snapshot.rows) : 0,
    finish,
    archived,
    hero,
    previousHeroWithoutConsent: prevHero && !prevHero.consent ? season.year - 1 : null,
    nextSeasonExists: Boolean(next),
    teamsCount: teams.length,
    teams: teamState,
    playerCount,
    entries: {
      total: entries.length,
      confirmed: confirmed.length,
      claimed: entries.filter((e) => e.paymentStatus === "CLAIMED").length,
      incomplete: confirmed.filter((e) => !e.submittedAt).length,
    },
    bottom,
  };
}

export async function loadSeasonGuide(season: Season, now = new Date()) {
  return buildSeasonGuide(await loadSeasonGuideState(season, now));
}
