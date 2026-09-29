/**
 * Kör en hel påhittad säsong mot en SEPARAT testdatabas och kontrollerar att allt beter sig rätt:
 * tippning, förra årets tabell, delomgångar, uppskjuten match, notiser, utmärkelser, prispott,
 * säsongsslut, gratisplats nästa år och demodata som aldrig får blandas med riktig data.
 *
 *   npm run verify:season
 *
 * Rör aldrig den riktiga databasen: skriptet skapar och använder alltid prisma/verify-season.db.
 */
import { execSync } from "node:child_process";
import { buildSchedule, createRng } from "../src/lib/simulation";

// Alltid en egen testdatabas – aldrig den riktiga (prisma/verify-season.db, ignoreras av git)
process.env.DATABASE_URL = "file:./verify-season.db";
execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "ignore", env: process.env });

let failures = 0;
const check = (ok: unknown, what: string) => {
  console.log(`${ok ? "  ✓" : "  ✗"} ${what}`);
  if (!ok) failures++;
};

async function main() {
  const { db } = await import("../src/lib/db");
  const { computeLeaderboard, computePrizes, completedRound } = await import("../src/lib/season");
  const { applyStandings } = await import("../src/lib/football-api");
  const { espnStandings } = await import("../src/lib/espn");
  const { loadDemoData, clearDemoData, realParticipantCount } = await import("../src/lib/demo-data");
  const { recordSnapshot } = await import("../src/lib/season");
  const { earnedFreeEntry } = await import("../src/lib/free-entry");
  const { canEditTip } = await import("../src/lib/tip-validation");

  // ── Tom testdatabas
  for (const m of ["award", "leaderboardRow", "standingRow", "standingSnapshot", "tipRow", "entry", "player", "oddsQuote", "chatMessage", "notificationRead", "notification", "pushSubscription", "follow", "session", "hallOfFame", "historicalResult", "seasonTeam", "season", "user", "team", "setting"] as const)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[m].deleteMany();

  const teams: { id: string }[] = [];
  for (let i = 0; i < 16; i++)
    teams.push(await db.team.create({ data: { name: `Lag ${String.fromCharCode(65 + i)}`, shortName: `L${i}`, aliases: "", primaryColor: "#000000", secondaryColor: "#ffffff", espnId: 1000 + i } }));
  const day = 864e5;
  const season = await db.season.create({
    data: {
      name: "Tips Allsvenskan 2027", year: 2027, entryFee: 111, reservedAmount: 300, isActive: true, totalRounds: 30,
      startDate: new Date(Date.now() + 10 * day), registrationDeadline: new Date(Date.now() + 8 * day), editDeadline: new Date(Date.now() + 8 * day),
    },
  });
  await db.seasonTeam.createMany({ data: teams.map((t) => ({ seasonId: season.id, teamId: t.id })) });
  const scorer = await db.player.create({ data: { seasonId: season.id, teamId: teams[0]!.id, name: "Anna Skytt", goals: 0, assists: 0 } });

  // Riktiga deltagare: 5 betalda, 1 gratisplats, 1 som bara sagt att hen swishat
  const rng = createRng(7);
  const people = [];
  for (let i = 0; i < 7; i++) {
    const u = await db.user.create({ data: { email: `p${i}@test.se`, name: `Person ${i}`, passwordHash: "x" } });
    const order = teams.map((t) => t.id).map((id, pos) => ({ id, k: pos + (rng() - 0.5) * 8 })).sort((a, b) => a.k - b.k).map((x) => x.id);
    const e = await db.entry.create({
      data: {
        userId: u.id, seasonId: season.id, paymentStatus: i === 6 ? "CLAIMED" : i === 5 ? "PENDING" : "CONFIRMED", freeEntry: i === 5,
        submittedAt: new Date(), topScorerId: scorer.id, rows: { create: order.map((teamId, idx) => ({ teamId, position: idx + 1 })) },
      },
    });
    people.push({ u, e });
  }

  console.log("\n0. Uppgradering av gamla tabeller");
  {
    const { migrateSnapshotRounds, getLatestSnapshot } = await import("../src/lib/season");
    const s0 = await db.season.create({ data: { name: "Gammal", year: 2020, startDate: new Date(), registrationDeadline: new Date(), editDeadline: new Date() } });
    // Gammal tabell sparad mitt i omgång 23: två lag har spelat 23, resten 22 → gammalt omgångsnummer 23
    const mk = (n23: number) =>
      teams.map((t, i) => ({ teamId: t.id, position: i + 1, played: i < n23 ? 23 : 22, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 40 - i, form: "" }));
    const old = await db.standingSnapshot.create({ data: { seasonId: s0.id, round: 23, source: "API", rows: { create: mk(2) } } });
    await migrateSnapshotRounds();
    check((await db.standingSnapshot.findUnique({ where: { id: old.id } }))!.round === 22, "gammal tabell mitt i omgång 23 räknas om till omgång 22");
    await db.standingSnapshot.create({ data: { seasonId: s0.id, round: 22, source: "API", rows: { create: mk(6) } } });
    check((await getLatestSnapshot(s0.id))!.id !== old.id, "en nyare tabell blir senaste efter omräkningen");
    check((await db.setting.findUnique({ where: { key: `announcedRound:${s0.id}` } }))?.value === "22", "redan visad omgång räknas som aviserad (ingen extra notis vid uppgradering)");
    await db.season.delete({ where: { id: s0.id } });
    await db.setting.deleteMany({ where: { key: { startsWith: "announcedRound:" } } });
  }

  console.log("\n1. Före seriestart");
  check((await computeLeaderboard(season.id)).ranked.length === 0, "ingen tipstabell innan första tabellen (inte alla på 0 fel)");
  check(canEditTip(season, people[0]!.e, new Date(), false).ok, "betald deltagare kan tippa före deadline");
  check(!canEditTip(season, people[6]!.e, new Date(), false).ok, "obekräftad betalning kan inte tippa");
  const zero = teams.map((t, i) => ({ teamId: t.id, position: i + 1, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: "" }));
  const z = await applyStandings(season.id, zero, "API");
  check(!z.recorded && (await db.standingSnapshot.count()) === 0, "tabell med 0 spelade matcher sparas inte");
  check((await db.notification.count()) === 0, "ingen notis om 'omgång 0'");

  // Förra årets tabell från ESPN (säsong 2026 när 2027 efterfrågas) ska nekas
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ children: [{ standings: { season: 2026, entries: [] } }] }), { status: 200 })) as typeof fetch;
  let rejected = false;
  try {
    await espnStandings(season.id, 2027);
  } catch (e) {
    rejected = /2026/.test((e as Error).message);
  }
  globalThis.fetch = realFetch;
  check(rejected, "ESPN-tabell för fel år (2026) nekas");

  const d1 = await loadDemoData(db, season.id, { recordSnapshot, production: false });
  check(!d1.ok && (await db.user.count({ where: { isDemo: true } })) === 0, "demodata går inte att läsa in när riktiga deltagare finns");

  console.log("\n2. Säsongen spelas (30 omgångar, 3 synkar per omgång, en uppskjuten match)");
  await db.season.update({ where: { id: season.id }, data: { editDeadline: new Date(Date.now() - day) } });
  check(!canEditTip({ editDeadline: new Date(Date.now() - day) }, people[0]!.e, new Date(), false).ok, "tipsen är låsta efter deadline");

  const schedule = buildSchedule(teams.map((t) => t.id), createRng(3));
  const table = new Map(teams.map((t) => [t.id, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }]));
  const toRows = () =>
    [...table.entries()]
      .sort((a, b) => b[1].pts - a[1].pts || b[1].gf - b[1].ga - (a[1].gf - a[1].ga) || a[0].localeCompare(b[0]))
      .map(([teamId, s], i) => ({ teamId, position: i + 1, played: s.played, won: s.won, drawn: s.drawn, lost: s.lost, goalsFor: s.gf, goalsAgainst: s.ga, points: s.pts, form: "" }));
  const play = (h: string, a: string) => {
    const hg = Math.floor(rng() * 4), ag = Math.floor(rng() * 3);
    const H = table.get(h)!, A = table.get(a)!;
    H.played++; A.played++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
    if (hg > ag) { H.won++; A.lost++; H.pts += 3; } else if (hg < ag) { A.won++; H.lost++; A.pts += 3; } else { H.drawn++; A.drawn++; H.pts++; A.pts++; }
  };
  let postponed: [string, string] | null = null;
  const perRoundNotices: number[] = [];
  for (const [r, matches] of schedule.entries()) {
    const before = await db.notification.count({ where: { type: "RESULTS" } });
    // Omgång 10: en match skjuts upp och spelas i omgång 12
    const list = r === 9 ? matches.slice(0, 7) : matches;
    if (r === 9) postponed = matches[7]!;
    for (const [i, [h, a]] of list.entries()) {
      play(h, a);
      if (i === 2 || i === 5 || i === list.length - 1) {
        await applyStandings(season.id, toRows(), "API");
        await db.player.update({ where: { id: scorer.id }, data: { goals: { increment: 1 } } });
      }
    }
    if (r === 11 && postponed) {
      play(...postponed);
      await applyStandings(season.id, toRows(), "API");
      postponed = null;
    }
    perRoundNotices.push((await db.notification.count({ where: { type: "RESULTS" } })) - before);
  }
  check(perRoundNotices.every((n) => n === 1), `exakt en notis per omgång (fick ${perRoundNotices.join(",")})`);
  const snaps = await db.standingSnapshot.findMany({ orderBy: [{ round: "asc" }, { createdAt: "asc" }] });
  check(completedRound(toRows()) === 30, "omgång 30 räknas som färdigspelad");
  check(snaps.some((s) => s.round === 10), "omgång 10 räknas som klar trots uppskjuten match");
  const awardSnaps = new Set((await db.award.findMany()).map((a) => a.snapshotId));
  check(awardSnaps.size <= 29 && awardSnaps.size >= 20, `utmärkelser högst en gång per omgång (${awardSnaps.size} omgångar med utmärkelser)`);
  const awardNotices = await db.notification.count({ where: { type: "AWARD" } });
  check(awardNotices <= 29, `högst en utmärkelse-notis per omgång (${awardNotices})`);
  const done = await db.notification.findMany({ where: { audience: "ADMIN", title: { contains: "Sista omgången" } } });
  check(done.length === 1, "admin får exakt en påminnelse om att avsluta säsongen");

  const lb = await computeLeaderboard(season.id);
  const ids = new Set(lb.ranked.map((r) => r.id));
  check(ids.has(people[5]!.e.id) && !ids.has(people[6]!.e.id), "gratisplats är med i tabellen, obekräftad betalning är inte med");
  check(lb.ranked.every((r) => r.previousRank !== null), "alla har pil jämfört med förra omgången");

  console.log("\n3. Prispott och säsongsslut");
  const prizes = await computePrizes(season.id);
  check(prizes.participants === 5, `potten räknar bara betalande (5), inte gratisplats eller obekräftade (${prizes.participants})`);
  check(prizes.pool === 5 * 111 - 300, `potten = 5 × 111 − 300 = ${5 * 111 - 300} kr (${prizes.pool})`);
  check(prizes.payouts.reduce((s, p) => s + p.amount, 0) <= prizes.pool, "utbetalningarna överstiger aldrig potten");
  check(prizes.losers.length >= 1, "sistaplatsen är utsedd");
  await db.season.update({ where: { id: season.id }, data: { isFinished: true, isActive: false } });

  console.log("\n4. Nästa år: gratisplats till sistaplatsen");
  const next = await db.season.create({
    data: { name: "Tips Allsvenskan 2028", year: 2028, isActive: true, startDate: new Date(Date.now() + 40 * day), registrationDeadline: new Date(Date.now() + 30 * day), editDeadline: new Date(Date.now() + 30 * day) },
  });
  const loserEntry = await db.entry.findUnique({ where: { id: prizes.losers[0]! } });
  const winnerEntry = lb.ranked[0]!;
  check(await earnedFreeEntry(loserEntry!.userId, next), "fjolårets sista får gratisplats");
  check(!(await earnedFreeEntry(winnerEntry.user.id, next)), "fjolårets vinnare får inte gratisplats");

  console.log("\n5. Demodata får aldrig röra riktig data");
  const demoSeason = await db.season.create({
    data: { name: "Demo 2029", year: 2029, startDate: new Date(), registrationDeadline: new Date(), editDeadline: new Date() },
  });
  await db.seasonTeam.createMany({ data: teams.map((t) => ({ seasonId: demoSeason.id, teamId: t.id })) });
  await recordSnapshot(demoSeason.id, toRows(), "MANUAL");
  const realBefore = { users: await db.user.count(), entries: await db.entry.count(), snaps: await db.standingSnapshot.count({ where: { NOT: { source: "SEED" } } }) };
  const d2 = await loadDemoData(db, demoSeason.id, { recordSnapshot, production: false });
  check(d2.ok, `demodata läses in i en tom tävling (${d2.ok ? d2.message : d2.error})`);
  const d3 = await loadDemoData(db, demoSeason.id, { recordSnapshot, production: false });
  check(!d3.ok, "demodata läses inte in två gånger");
  const demoConfirmed = await db.entry.count({ where: { seasonId: demoSeason.id, paymentStatus: "CONFIRMED" } });
  const demoLb = (await computeLeaderboard(demoSeason.id)).ranked.length;
  check(demoLb === demoConfirmed && demoLb >= 18, `demotipparna syns i tabellen när inga riktiga finns (${demoLb} bekräftade av 22, resten "har swishat")`);

  // En riktig deltagare anmäler sig medan demodata är på
  const realUser = await db.user.create({ data: { email: "riktig@test.se", name: "Riktig Person", passwordHash: "x" } });
  const realEntry = await db.entry.create({
    data: { userId: realUser.id, seasonId: demoSeason.id, paymentStatus: "CONFIRMED", submittedAt: new Date(), rows: { create: teams.map((t, i) => ({ teamId: t.id, position: i + 1 })) } },
  });
  const mixed = await computeLeaderboard(demoSeason.id);
  check(mixed.ranked.length === 1 && mixed.ranked[0]!.id === realEntry.id, "så fort en riktig deltagare finns räknas demotipparna bort ur tabellen");
  check((await computePrizes(demoSeason.id)).participants === 1, "… och ur prispotten");
  check((await realParticipantCount(db, demoSeason.id)) === 1, "riktiga deltagare räknas rätt");

  const c = await clearDemoData(db);
  check(c.ok, "demodata rensas");
  check((await db.user.count({ where: { isDemo: true } })) === 0, "alla demotippare är borta");
  check(Boolean(await db.entry.findUnique({ where: { id: realEntry.id } })), "den riktiga deltagarens tips finns kvar");
  check((await db.user.count()) === realBefore.users + 1, "inga riktiga konton raderade");
  check((await db.entry.count()) === realBefore.entries + 1, "inga riktiga tips raderade");
  check((await db.standingSnapshot.count({ where: { NOT: { source: "SEED" } } })) === realBefore.snaps, "inga riktiga tabeller raderade");
  const orphan = await db.award.findMany({ where: { entryId: { notIn: (await db.entry.findMany({ select: { id: true } })).map((e) => e.id) } } });
  check(orphan.length === 0, "inga utmärkelser pekar på raderade demotippare");

  console.log(failures ? `\n✗ ${failures} kontroll(er) misslyckades` : "\n✓ Alla kontroller gick igenom");
  await db.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
