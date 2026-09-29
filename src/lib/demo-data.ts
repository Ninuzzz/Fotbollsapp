/**
 * Demodata: påhittade tippare, tips, chatt, exempelodds och tabellhistorik – så att sajten går att visa upp.
 *
 * Säkerhetsregler (riktiga användares data får ALDRIG påverkas):
 *  1. Demotippare markeras med User.isDemo. Allt som rensas hittas via den markeringen – aldrig via e-post eller namn.
 *  2. Att läsa in demodata raderar och ändrar ingenting; det lägger bara till.
 *  3. Det går inte att läsa in demodata om riktiga deltagare redan finns i den aktiva tävlingen.
 *  4. Tabellhistorik fylls bara på om tävlingen saknar riktig historik (högst en riktig tabell).
 *  5. Anmäler sig en riktig deltagare medan demodata är på räknas demotipparna bort ur tabell och prispott
 *     (se computeLeaderboard/computePrizes).
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

type Db = PrismaClient;

/** Demotippare: markerade, eller äldre demokonton från före markeringen (demo@…, demo1@… – aldrig admin). */
export const DEMO_USER_WHERE = {
  OR: [{ isDemo: true }, { role: "USER", email: { startsWith: "demo", endsWith: "@allsvenskantipset.se" } }],
};

const NAMES = [
  "Kristina Holm", "Peder Lundell", "Maja Ekström", "Göran Falk", "Sara Nyqvist", "Tobias Dahl", "Elin Sandberg",
  "Rasmus Hedin", "Lotta Wikström", "Jonas Berglund", "Annika Sjöberg", "Mikael Rönn", "Frida Almqvist", "Olle Stenberg",
  "Karin Lindh", "Patrik Engström", "Hanna Borg", "Fredrik Lund", "Emma Östlund", "Daniel Söder", "Ingrid Malm",
];
const PATTERNS = ["solid", "stripes", "hoops", "halves", "sash"];
const CHAT = [
  "Välkomna till årets tips! Tabellen uppdateras automatiskt efter varje omgång. ⚽",
  "Vem hade den här ettan i sitt tips? 😅",
  "Inte jag. Jag hade dem på elfte plats…",
  "Min skytteligavinnare har två mål på fem matcher. Det blir tufft i utslagsfrågan.",
  "Det här tar vi, jag lovar 💚🤍",
  "Veckans raket igen! 🚀",
];

/** Deterministisk slump: samma demodata varje gång */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Riktiga deltagare = konton med ett deltagande i tävlingen som INTE är demotippare. */
export async function realParticipantCount(db: Db, seasonId: string) {
  return db.entry.count({ where: { seasonId, user: { NOT: DEMO_USER_WHERE } } });
}

export async function demoUserCount(db: Db) {
  return db.user.count({ where: DEMO_USER_WHERE });
}

export type DemoResult = { ok: true; message: string } | { ok: false; error: string };

export async function loadDemoData(db: Db, seasonId: string, opts: { recordSnapshot: RecordFn; production: boolean }): Promise<DemoResult> {
  const real = await realParticipantCount(db, seasonId);
  if (real > 0)
    return { ok: false, error: `Det finns redan ${real} riktiga deltagare i tävlingen. Demodata läses bara in när tävlingen är tom, så att riktiga tips aldrig blandas med påhittade.` };
  if ((await demoUserCount(db)) > 0) return { ok: false, error: "Demodata är redan inläst." };

  const rand = rng(2026);
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)]!;
  const season = await db.season.findUniqueOrThrow({ where: { id: seasonId } });
  const teams = (await db.seasonTeam.findMany({ where: { seasonId }, include: { team: true } })).map((s) => s.team);
  if (teams.length < 2) return { ok: false, error: "Tävlingen har inga lag än. Lägg till lag först." };
  const players = await db.player.findMany({ where: { seasonId } });
  const latest = await db.standingSnapshot.findFirst({
    where: { seasonId },
    orderBy: [{ round: "desc" }, { createdAt: "desc" }],
    include: { rows: { orderBy: { position: "asc" } } },
  });

  // Förväntad slutordning: aktuell tabell om den finns, annars laglistan
  const expected = latest?.rows.length ? latest.rows.map((r) => r.teamId) : teams.map((t) => t.id);

  // 1. Demotippare (lösenord: känt lokalt för test, slumpat i drift)
  const hash = await bcrypt.hash(opts.production ? randomBytes(24).toString("base64url") : "tipset2026", 11);
  const users = [];
  for (const [i, name] of ["Demo Tippare", ...NAMES].entries()) {
    const team = pick(teams);
    users.push(
      await db.user.create({
        data: {
          email: i === 0 ? "demo@allsvenskantipset.se" : `demo${i}@allsvenskantipset.se`,
          name,
          isDemo: true,
          passwordHash: hash,
          favoriteTeamId: team.id,
          avatar: `jersey:${pick(PATTERNS)}:${team.primaryColor}:${team.secondaryColor}:${1 + Math.floor(rand() * 23)}`,
          privacyAcceptedAt: new Date(),
        },
      }),
    );
  }

  // 2. Deltaganden och tips: förväntad ordning + brus
  const scorers = players.filter((p) => p.goals >= 4);
  const assisters = players.filter((p) => p.assists >= 3);
  for (const [i, u] of users.entries()) {
    const noise = 1.5 + rand() * 5;
    const order = expected
      .map((id, pos) => ({ id, key: pos + (rand() - 0.5) * noise * 2 }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.id);
    const status = i % 9 === 4 ? "CLAIMED" : "CONFIRMED";
    await db.entry.create({
      data: {
        userId: u.id,
        seasonId,
        paymentStatus: status,
        paidAt: status === "CONFIRMED" ? season.registrationDeadline : null,
        paidBy: i % 7 === 3 ? "M.L." : null,
        topScorerId: scorers.length ? pick(scorers).id : null,
        topAssistId: assisters.length ? pick(assisters).id : null,
        submittedAt: season.editDeadline,
        rows: { create: order.map((teamId, idx) => ({ position: idx + 1, teamId })) },
      },
    });
  }

  // 3. Chatt
  for (const [i, body] of CHAT.entries())
    await db.chatMessage.create({ data: { seasonId, userId: users[(i * 3 + 1) % users.length]!.id, body, createdAt: new Date(Date.now() - (CHAT.length - i) * 3.6e6) } });

  // 4. Exempelodds – bara om inga riktiga odds finns
  if (!(await db.oddsQuote.count({ where: { seasonId } }))) {
    for (const b of ["Unibet", "Svenska Spel", "Bet365"])
      for (const [pos, teamId] of expected.entries())
        await db.oddsQuote.create({
          data: { seasonId, teamId, bookmaker: b, market: "WINNER", odds: Math.round((2.4 + pos ** 1.7 * 1.9) * (0.92 + rand() * 0.16) * 100) / 100, source: "SEED" },
        });
  }

  // 5. Tabellhistorik – bara om tävlingen saknar riktig historik, så att riktiga tabeller aldrig ändras
  let history = 0;
  const snapshots = await db.standingSnapshot.count({ where: { seasonId } });
  if (latest && latest.round > 1 && snapshots <= 1) {
    const final = latest.rows;
    for (let round = 1; round < latest.round; round++) {
      const f = round / latest.round;
      const rows = final
        .map((r) => ({ r, pts: Math.max(0, Math.round(r.points * f + (rand() - 0.5) * 8)) }))
        .sort((a, b) => b.pts - a.pts)
        .map(({ r, pts }, idx) => ({
          teamId: r.teamId, position: idx + 1, played: round, points: pts,
          won: Math.round(r.won * f), drawn: Math.round(r.drawn * f), lost: Math.round(r.lost * f),
          goalsFor: Math.round(r.goalsFor * f), goalsAgainst: Math.round(r.goalsAgainst * f), form: "",
        }));
      await opts.recordSnapshot(seasonId, rows, "SEED");
      history++;
    }
    // Aktuell tabell en gång till (som demotabell), så att pilar och veckans utmärkelser räknas mot historiken
    await opts.recordSnapshot(
      seasonId,
      final.map((r) => ({ teamId: r.teamId, position: r.position, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, points: r.points, form: r.form })),
      "SEED",
    );
  }

  await db.setting.upsert({ where: { key: "demoData" }, create: { key: "demoData", value: "true" }, update: { value: "true" } });
  return { ok: true, message: `Demodata inläst: ${users.length} demotippare med tips, chatt${history ? ` och tabellhistorik för ${history} omgångar` : ""}.` };
}

type RecordFn = (seasonId: string, rows: StandingRow[], source: "SEED") => Promise<unknown>;
type StandingRow = {
  teamId: string; position: number; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; points: number; form: string;
};

/** Tar bort ALL demodata och inget annat. Riktiga konton, tips, tabeller och historik rörs inte. */
export async function clearDemoData(db: Db): Promise<DemoResult> {
  const demoUsers = await demoUserCount(db);
  const flagged = (await db.setting.findUnique({ where: { key: "demoData" } }))?.value === "true";
  if (!demoUsers && !flagged) return { ok: false, error: "Ingen demodata finns." };

  let demoPlayerIds: string[] = [];
  try {
    const raw = (await db.setting.findUnique({ where: { key: "demoPlayerIds" } }))?.value;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) demoPlayerIds = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // trasig lista = rör inga spelare
  }

  await db.$transaction(async (tx) => {
    // Utmärkelser saknar databaskoppling till deltagandet – ta bort demotipparnas först, annars blir de "?" i listan
    const demoEntryIds = (await tx.entry.findMany({ where: { user: DEMO_USER_WHERE }, select: { id: true } })).map((e) => e.id);
    if (demoEntryIds.length) await tx.award.deleteMany({ where: { entryId: { in: demoEntryIds } } });
    // Demotippare – kaskad tar deras deltaganden, tips, tabellrader, chatt, följningar och lästa notiser
    await tx.user.deleteMany({ where: DEMO_USER_WHERE });
    await tx.oddsQuote.deleteMany({ where: { source: "SEED" } });
    // Syntetisk tabellhistorik. Finns ingen riktig tabell kvar behålls den senaste som vanlig tabell.
    for (const s of await tx.season.findMany({ select: { id: true } })) {
      const seed = await tx.standingSnapshot.findMany({ where: { seasonId: s.id, source: "SEED" }, orderBy: [{ round: "desc" }, { createdAt: "desc" }] });
      if (!seed.length) continue;
      const realLeft = await tx.standingSnapshot.count({ where: { seasonId: s.id, NOT: { source: "SEED" } } });
      const [keep, ...drop] = realLeft ? [null, ...seed] : seed;
      if (drop.length) await tx.standingSnapshot.deleteMany({ where: { id: { in: drop.map((x) => x!.id) } } });
      if (keep) {
        await tx.leaderboardRow.deleteMany({ where: { snapshotId: keep.id } });
        await tx.award.deleteMany({ where: { snapshotId: keep.id } });
        await tx.standingSnapshot.update({ where: { id: keep.id }, data: { source: "MANUAL" } });
      }
    }
    // Påhittade spelare som seeden skapade (bara när ESPN inte gick att nå) och som ingen riktig tippare valt
    if (demoPlayerIds.length)
      await tx.player.deleteMany({ where: { id: { in: demoPlayerIds }, scorerTips: { none: {} }, assistTips: { none: {} } } });
    await tx.setting.deleteMany({ where: { key: { in: ["demoData", "demoPlayerIds"] } } });
  });
  return { ok: true, message: "Demodata är borttagen. Riktiga konton, tips, tabell, Hall of Fame och historik finns kvar." };
}
