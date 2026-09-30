import { cache } from "react";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { computeErrors, rankEntries, type Ranked, type TeamDiff } from "./scoring";
import { computeAwards, AWARD_LABEL, type AwardKind } from "./awards";
import { distributePrizes, lastPlace, parseSplit, prizePool } from "./prizes";
import { DEMO_USER_WHERE, REAL_MEMBER_WHERE } from "./demo-data";

/** Databasklient: vanliga `db` eller en transaktion (`tx`) – samma frågor fungerar i båda. */
type Client = Prisma.TransactionClient;

/** Bekräftad deltagare: betalt eller gratisplats */
const CONFIRMED = { OR: [{ paymentStatus: "CONFIRMED" }, { freeEntry: true }] };

/**
 * Riktiga deltagare går alltid före demotippare: så fort en riktig (icke-admin) deltagare är bekräftad räknas
 * demotipparna bort ur tabell, prispott och utmärkelser – även om någon glömt att rensa demodatan.
 * Adminens eget deltagande räknas inte som "riktigt" här, så att demodatan går att visa upp bredvid det.
 */
async function demoFilter(seasonId: string, client: Client = db) {
  const real = await client.entry.count({ where: { seasonId, ...CONFIRMED, user: REAL_MEMBER_WHERE } });
  return real ? { user: { NOT: DEMO_USER_WHERE } } : {};
}

/**
 * Färdigspelad omgång: högsta N där minst alla lag utom två har spelat N matcher. Så räknas en omgång som klar
 * även om en enstaka match skjutits upp, men inte mitt i en omgång när bara några lag har spelat.
 */
export function completedRound(rows: { played: number }[]): number {
  if (!rows.length) return 0;
  const need = Math.max(1, rows.length - 2);
  const sorted = rows.map((r) => r.played).sort((a, b) => b - a);
  return sorted[need - 1] ?? 0;
}

/** Cachas per förfrågan: layouten och sidan frågar båda efter säsongen. */
export const getActiveSeason = cache(async () => {
  return (
    (await db.season.findFirst({ where: { isActive: true }, orderBy: { year: "desc" } })) ??
    (await db.season.findFirst({ orderBy: { year: "desc" } }))
  );
});

export type Season = NonNullable<Awaited<ReturnType<typeof getActiveSeason>>>;

export function seasonPhase(s: Season, now = new Date()) {
  if (s.isFinished) return "FINISHED" as const;
  if (now <= s.editDeadline) return "TIPPING" as const;
  return "RUNNING" as const;
}

export async function getSeasonTeams(seasonId: string) {
  const rows = await db.seasonTeam.findMany({ where: { seasonId }, include: { team: true } });
  return rows.map((r) => r.team).sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

export async function getLatestSnapshot(seasonId: string, client: Client = db) {
  return client.standingSnapshot.findFirst({
    where: { seasonId },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
    include: { rows: { include: { team: true }, orderBy: { position: "asc" } } },
  });
}

type LatestSnapshot = NonNullable<Awaited<ReturnType<typeof getLatestSnapshot>>>;

export type LeaderboardEntry = Ranked<{
  id: string;
  errors: number;
  exact: number;
  scorerGoals: number | null;
  assistCount: number | null;
}> & {
  user: { id: string; name: string; avatar: string; favoriteTeamId: string | null };
  paymentStatus: string;
  topScorer: { name: string; goals: number; photoUrl: string | null } | null;
  topAssist: { name: string; assists: number; photoUrl: string | null } | null;
  perTeam: TeamDiff[];
  previousRank: number | null;
};

/**
 * Räknar ut tipstabellen live mot senaste verkliga tabellen.
 * `snapshot` räknar i stället mot en given tabell (används när tipstabellen för en tabell ska skapas eller lagas),
 * `client` gör att samma beräkning kan köras inne i en transaktion.
 */
export async function computeLeaderboard(seasonId: string, opts: { client?: Client; snapshot?: LatestSnapshot } = {}) {
  const client = opts.client ?? db;
  const snapshot = opts.snapshot ?? (await getLatestSnapshot(seasonId, client));
  // Ingen tabell än (före första omgången): ingen tipstabell – annars skulle alla ligga på 0 fel
  if (!snapshot) return { snapshot, ranked: [] as LeaderboardEntry[], leaderGoals: 0, leaderAssists: 0 };
  const entries = await client.entry.findMany({
    // Bara bekräftade deltagare (betalt eller gratisplats) är med i tabellen och kan vinna pengar.
    // Återställer Anders en betalning till "väntar" försvinner tipparen alltså ur tabellen tills den är bekräftad igen.
    where: { seasonId, submittedAt: { not: null }, ...CONFIRMED, ...(await demoFilter(seasonId, client)) },
    include: {
      rows: true,
      user: { select: { id: true, name: true, avatar: true, favoriteTeamId: true } },
      topScorer: true,
      topAssist: true,
    },
  });
  const players = await client.player.findMany({ where: { seasonId } });
  const leaderGoals = Math.max(0, ...players.map((p) => p.goals));
  const leaderAssists = Math.max(0, ...players.map((p) => p.assists));
  const actual = new Map(snapshot.rows.map((r) => [r.teamId, r.position]));

  // Pilar upp/ner jämför med förra färdigspelade omgången – inte med förra timmens synk mitt i en omgång
  const prevSnap = await client.standingSnapshot.findFirst({
    where: { seasonId, round: { lt: snapshot.round } },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
    include: { leaderboard: true },
  });
  const prevRank = new Map(prevSnap?.leaderboard.map((l) => [l.entryId, l.rank]) ?? []);

  const scored = entries.map((e) => {
    const tip = new Map(e.rows.map((r) => [r.teamId, r.position]));
    const res = computeErrors(tip, actual);
    return {
      id: e.id,
      errors: res.total,
      exact: res.exact,
      scorerGoals: e.topScorer ? e.topScorer.goals : null,
      assistCount: e.topAssist ? e.topAssist.assists : null,
      user: e.user,
      paymentStatus: e.paymentStatus,
      topScorer: e.topScorer ? { name: e.topScorer.name, goals: e.topScorer.goals, photoUrl: e.topScorer.photoUrl } : null,
      topAssist: e.topAssist
        ? { name: e.topAssist.name, assists: e.topAssist.assists, photoUrl: e.topAssist.photoUrl }
        : null,
      perTeam: res.perTeam,
      previousRank: prevRank.get(e.id) ?? null,
    };
  });
  const ranked = rankEntries(scored, leaderGoals, leaderAssists) as LeaderboardEntry[];
  return { snapshot, ranked, leaderGoals, leaderAssists };
}

/**
 * Samma tipstabell behövs flera gånger per sidvisning (sidan + prispotten). Den cachade varianten räknas
 * bara ut en gång per förfrågan. Skrivande kod (recordSnapshot) använder den ocachade computeLeaderboard.
 */
export const getLeaderboard = cache((seasonId: string) => computeLeaderboard(seasonId));

export async function computePrizes(seasonId: string) {
  const [season, { ranked }] = await Promise.all([db.season.findUniqueOrThrow({ where: { id: seasonId } }), getLeaderboard(seasonId)]);
  // Potten = betalande × avgift − avsatt. Gratisplatser (fjolårets sistaplats) har inte betalat och räknas inte in.
  const participants = await db.entry.count({
    where: { seasonId, paymentStatus: "CONFIRMED", freeEntry: false, ...(await demoFilter(seasonId)) },
  });
  const pool = prizePool({
    entryFee: season.entryFee,
    participants,
    reservedAmount: season.reservedAmount,
    split: parseSplit(season.prizeSplit),
  });
  const payouts = distributePrizes(ranked, pool, parseSplit(season.prizeSplit));
  const losers = lastPlace(ranked);
  // Pengar som inte delas ut: avrundning nedåt till hela kronor vid delade placeringar (högst några kronor) och prisplatser
  // som saknar mottagare (t.ex. tidigt på säsongen). Visas för admin så att inget försvinner utan att någon vet om det.
  const unallocated = Math.max(0, pool - payouts.reduce((sum, p) => sum + p.amount, 0));
  return { season, participants, pool, payouts, losers, ranked, unallocated };
}

type StandingInput = {
  teamId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form?: string;
};

/**
 * De senaste `limit` omgångarnas sista tabell (en per omgång), nyast först, med tipstabellsrader.
 * Läser först bara id:n för alla tabeller och hämtar sedan tipstabellsraderna för de få som behövs – en säsong kan ha
 * hundratals tabeller (en per timmes ändring) men bara en per omgång används.
 */
async function recentRoundSnapshots(seasonId: string, limit: number, client: Client = db) {
  const heads = await client.standingSnapshot.findMany({
    where: { seasonId },
    select: { id: true, round: true },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
  });
  const perRound = new Map<number, string>();
  // Sorterat nyast först: första träffen per omgång är omgångens sista tabell
  for (const h of heads) if (!perRound.has(h.round)) perRound.set(h.round, h.id);
  const ids = [...perRound.values()].slice(0, limit);
  if (!ids.length) return [];
  const full = await client.standingSnapshot.findMany({ where: { id: { in: ids } }, include: { leaderboard: true } });
  const byId = new Map(full.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)!).filter(Boolean);
}

/**
 * Sparar en ny verklig tabell, beräknar tipstabellen, utmärkelser och skapar notiser.
 * Anropas både från API-synk och när admin uppdaterar manuellt.
 *
 * Allt skrivs i EN transaktion: en krasch (t.ex. en omstart mitt under en deploy) lämnar aldrig en tabell utan
 * tipstabell. Anropa via applyStandings så att synklåset håller samtidiga körningar isär.
 */
export async function recordSnapshot(seasonId: string, rows: StandingInput[], source: "API" | "MANUAL" | "SEED") {
  const round = completedRound(rows);
  const latest = await getLatestSnapshot(seasonId);
  // Hoppa över om inget har ändrats sedan förra (vanligt vid schemalagd synk)
  if (
    latest &&
    source === "API" &&
    latest.rows.length === rows.length &&
    rows.every((r) => {
      const l = latest.rows.find((x) => x.teamId === r.teamId);
      return l && l.position === r.position && l.played === r.played && l.points === r.points;
    })
  ) {
    return { snapshot: latest, changed: false, awards: [] as { kind: AwardKind; names: string[]; delta: number }[] };
  }

  // Skrivningen först i transaktionen: då tas skrivlåset direkt och inget annat hinner ändra under oss
  return db.$transaction(
    async (tx) => {
      const snapshot = await tx.standingSnapshot.create({
        data: {
          seasonId,
          round,
          source,
          rows: { create: rows.map((r) => ({ ...r, form: r.form ?? "" })) },
        },
        include: { rows: { include: { team: true }, orderBy: { position: "asc" } } },
      });
      // Tipstabellen räknas mot just den här tabellen (inte "senaste"), även om en äldre omgång skulle skickas in
      const { ranked } = await computeLeaderboard(seasonId, { client: tx, snapshot });
      await tx.leaderboardRow.createMany({
        data: ranked.map((r) => ({
          snapshotId: snapshot.id,
          entryId: r.id,
          rank: r.rank,
          errors: r.errors,
          exact: r.exact,
          scorerGap: r.scorerGap,
          assistGap: r.assistGap,
        })),
      });

      // Utmärkelser: en gång per färdigspelad omgång, mot förra omgångens slutläge (inte mot förra timmens synk)
      const awardsOut: { kind: AwardKind; names: string[]; delta: number }[] = [];
      const newRound = !latest || round > latest.round;
      const recent = newRound ? await recentRoundSnapshots(seasonId, 5, tx) : [];
      if (newRound && recent.length >= 2) {
        const [cur, prev] = recent;
        const history = new Map<string, number[]>();
        for (const s of [...recent].reverse())
          for (const l of s.leaderboard) history.set(l.entryId, [...(history.get(l.entryId) ?? []), l.rank]);
        const awards = computeAwards(
          new Map(prev.leaderboard.map((l) => [l.entryId, l.rank])),
          new Map(cur.leaderboard.map((l) => [l.entryId, l.rank])),
          history,
        );
        const nameOf = new Map(ranked.map((r) => [r.id, r.user.name]));
        for (const a of awards) {
          await tx.award.createMany({
            data: a.entryIds.map((entryId) => ({ seasonId, snapshotId: snapshot.id, kind: a.kind, entryId, delta: a.delta })),
          });
          awardsOut.push({ kind: a.kind, delta: a.delta, names: a.entryIds.map((id) => nameOf.get(id) ?? "?") });
        }
      }
      return { snapshot, changed: true, awards: awardsOut };
    },
    { timeout: 30_000, maxWait: 15_000 },
  );
}

/**
 * Lagar tabeller som saknar tipstabell (t.ex. efter en krasch innan skrivningen blev en transaktion). Tomma tabeller
 * är onormala: en tabell sparas alltid tillsammans med sin tipstabell så snart det finns bekräftade tips.
 * Idempotent – gör ingenting när allt är helt.
 */
export async function repairLeaderboards(seasonId: string) {
  const broken = await db.standingSnapshot.findMany({
    where: { seasonId, leaderboard: { none: {} } },
    include: { rows: { include: { team: true }, orderBy: { position: "asc" } } },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
  });
  let fixed = 0;
  for (const snapshot of broken) {
    const { ranked } = await computeLeaderboard(seasonId, { snapshot });
    if (!ranked.length) continue;
    await db.leaderboardRow.createMany({
      data: ranked.map((r) => ({ snapshotId: snapshot.id, entryId: r.id, rank: r.rank, errors: r.errors, exact: r.exact, scorerGap: r.scorerGap, assistGap: r.assistGap })),
    });
    fixed++;
  }
  return fixed;
}

/**
 * Engångsomräkning: tidigare sparades omgång som "flest spelade matcher" (även mitt i en omgång). Nu gäller
 * färdigspelad omgång. Utan omräkning kunde en gammal tabell ligga kvar som "senaste" för alltid.
 * Idempotent – körs vid serverstart och gör ingenting andra gången. Tål samtidiga körningar (upsert).
 */
export async function migrateSnapshotRounds() {
  const key = "migration:completedRound";
  if (await db.setting.findUnique({ where: { key } })) return 0;
  const snaps = await db.standingSnapshot.findMany({ include: { rows: { select: { played: true } } } });
  let changed = 0;
  for (const s of snaps) {
    const r = completedRound(s.rows);
    if (r !== s.round) {
      await db.standingSnapshot.update({ where: { id: s.id }, data: { round: r } });
      changed++;
    }
  }
  // Redan aviserade omgångar: räkna dagens tabell som aviserad, så att uppgraderingen inte skickar en extra notis
  for (const season of await db.season.findMany({ select: { id: true } })) {
    const latest = await getLatestSnapshot(season.id);
    if (latest)
      await db.setting.upsert({
        where: { key: `announcedRound:${season.id}` },
        create: { key: `announcedRound:${season.id}`, value: String(latest.round) },
        update: {},
      });
  }
  await db.setting.upsert({ where: { key }, create: { key, value: new Date().toISOString() }, update: {} });
  return changed;
}

export function awardText(a: { kind: AwardKind; names: string[]; delta: number }) {
  const who = a.names.join(" & ");
  if (a.kind === "ROCKET") return `${AWARD_LABEL.ROCKET}: ${who} (+${a.delta} placeringar)`;
  if (a.kind === "DIVE") return `${AWARD_LABEL.DIVE}: ${who} (−${a.delta} placeringar)`;
  return `${AWARD_LABEL.YOYO}: ${who} (${a.delta} placeringar fram och tillbaka)`;
}

/** Senaste utmärkelserna för en säsong, med namn. */
export async function latestAwards(seasonId: string) {
  const snap = await db.award.findFirst({ where: { seasonId }, orderBy: { createdAt: "desc" } });
  if (!snap) return [];
  const awards = await db.award.findMany({ where: { snapshotId: snap.snapshotId } });
  const entries = await db.entry.findMany({
    where: { id: { in: awards.map((a) => a.entryId) } },
    include: { user: { select: { id: true, name: true, avatar: true } } },
  });
  const byId = new Map(entries.map((e) => [e.id, e.user]));
  // Utmärkelser för raderade deltaganden (t.ex. ett raderat konto) visas inte
  return awards.filter((a) => byId.has(a.entryId)).map((a) => ({ ...a, kind: a.kind as AwardKind, user: byId.get(a.entryId) ?? null }));
}

/**
 * Rankhistorik per entry för grafer: en punkt per omgång (omgångens sista tabell).
 * Hämtar bara id:n för alla tabeller och tipstabellsrader för de som ritas – kostnaden växer med antal omgångar,
 * inte med antal tabeller.
 */
export async function rankHistory(seasonId: string) {
  const heads = await db.standingSnapshot.findMany({
    where: { seasonId },
    select: { id: true, round: true },
    orderBy: [{ round: "asc" }, { createdAt: "asc" }],
  });
  const byRound = new Map<number, string>();
  for (const h of heads) byRound.set(h.round, h.id); // senaste tabellen per omgång vinner
  const rounds = [...byRound.entries()];
  if (!rounds.length) return [];
  const full = await db.standingSnapshot.findMany({ where: { id: { in: rounds.map(([, id]) => id) } }, include: { leaderboard: true } });
  const byId = new Map(full.map((s) => [s.id, s]));
  return rounds.map(([round, id]) => {
    const s = byId.get(id)!;
    return {
      round,
      ranks: Object.fromEntries(s.leaderboard.map((l) => [l.entryId, l.rank])),
      errors: Object.fromEntries(s.leaderboard.map((l) => [l.entryId, l.errors])),
    };
  });
}
