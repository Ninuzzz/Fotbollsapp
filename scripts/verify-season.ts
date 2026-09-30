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
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { buildSchedule, createRng } from "../src/lib/simulation";

// Alltid en egen testdatabas – aldrig den riktiga (prisma/verify-season.db, ignoreras av git)
process.env.DATABASE_URL = "file:./verify-season.db";
// Backuper från testet hamnar i en tillfällig mapp, aldrig bredvid någon riktig databas
process.env.BACKUP_DIR = mkdtempSync(path.join(os.tmpdir(), "verify-season-backups-"));
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


  console.log("\n6. Skärpta regler (demoläge med admins, karantän, lås, avslut, backup)");
  {
    const { providerOrder } = await import("../src/lib/football-api");
    const { getPendingStandings } = await import("../src/lib/quarantine");
    const { withLock } = await import("../src/lib/sync-lock");
    const { repairLeaderboards } = await import("../src/lib/season");
    const { finishCheck, finalizeSeason, reopenSeason, getFinalResult, seasonFrozen } = await import("../src/lib/finish");
    const { createBackup, listBackups } = await import("../src/lib/backup");
    const { verifyDatabaseFile } = await import("../src/lib/backup-verify");
    const { checkSyncHealth } = await import("../src/lib/health");
    const { isMember } = await import("../src/lib/chat-access");
    const { registrationOpen } = await import("../src/lib/demo");
    const { goLiveChecks } = await import("../src/lib/golive");
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const teamIds = teams.map((t) => t.id);

    // Äkta, konsekventa tabeller från en simulerad serie (hela, eller med sista matchen uppskjuten)
    const simulate = (seed: number, skipLast = false) => {
      const r = createRng(seed);
      const t = new Map(teamIds.map((id) => [id, { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }]));
      const play = (h: string, a: string) => {
        const hg = Math.floor(r() * 4), ag = Math.floor(r() * 3);
        const H = t.get(h)!, A = t.get(a)!;
        H.played++; A.played++; H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
        if (hg > ag) { H.won++; A.lost++; H.pts += 3; } else if (hg < ag) { A.won++; H.lost++; A.pts += 3; } else { H.drawn++; A.drawn++; H.pts++; A.pts++; }
      };
      const sched = buildSchedule(teamIds, createRng(seed + 1));
      sched.forEach((ms, ri) => ms.forEach(([h, a], i) => { if (!(skipLast && ri === sched.length - 1 && i === ms.length - 1)) play(h, a); }));
      return [...t.entries()]
        .sort((a, b) => b[1].pts - a[1].pts || b[1].gf - b[1].ga - (a[1].gf - a[1].ga) || a[0].localeCompare(b[0]))
        .map(([teamId, s], i) => ({ teamId, position: i + 1, played: s.played, won: s.won, drawn: s.drawn, lost: s.lost, goalsFor: s.gf, goalsAgainst: s.ga, points: s.pts, form: "" }));
    };
    const fullRows = simulate(21);
    const partialRows = simulate(21, true);
    const trng = createRng(99);
    let uid = 0;
    const mkSeason = async (year: number, active = false) => {
      const s = await db.season.create({
        data: { name: `Test ${year}`, year, isActive: active, totalRounds: 30, entryFee: 100, reservedAmount: 0, startDate: new Date(Date.now() - 60 * day), registrationDeadline: new Date(Date.now() - 70 * day), editDeadline: new Date(Date.now() - 65 * day) },
      });
      await db.seasonTeam.createMany({ data: teamIds.map((teamId) => ({ seasonId: s.id, teamId })) });
      return s;
    };
    const mkEntry = async (seasonId: string, opts: { role?: string; status?: string } = {}) => {
      const u = await db.user.create({ data: { email: `x${++uid}@test.se`, name: `Test ${uid}`, passwordHash: "x", role: opts.role ?? "USER" } });
      const order = teamIds.map((id, pos) => ({ id, k: pos + (trng() - 0.5) * 6 })).sort((a, b) => a.k - b.k).map((x) => x.id);
      const e = await db.entry.create({
        data: { userId: u.id, seasonId, paymentStatus: opts.status ?? "CONFIRMED", submittedAt: new Date(), rows: { create: order.map((teamId, idx) => ({ teamId, position: idx + 1 })) } },
      });
      return { u, e };
    };

    // ── A. Demoläge: bara admins som deltagare
    console.log("  A. Demoläge");
    const sA = await mkSeason(2031, true);
    await db.season.updateMany({ where: { NOT: { id: sA.id } }, data: { isActive: false } });
    const adminA = await mkEntry(sA.id, { role: "ADMIN" });
    await applyStandings(sA.id, fullRows, "API");
    check(!(await realParticipantCount(db, sA.id)), "adminens deltagande räknas inte som riktig deltagare");
    const demoA = await loadDemoData(db, sA.id, { recordSnapshot, production: false });
    check(demoA.ok, `demodata kan läsas in när bara admin har anmält sig (${demoA.ok ? "ok" : demoA.error})`);
    const lbA = await computeLeaderboard(sA.id);
    check(lbA.ranked.length >= 20 && lbA.ranked.some((r) => r.id === adminA.e.id), "demotippare och adminens eget tips visas tillsammans i demoläget");
    const realA = await mkEntry(sA.id);
    check((await realParticipantCount(db, sA.id)) === 1, "en vanlig deltagare räknas som riktig");
    const lbA2 = await computeLeaderboard(sA.id);
    check(lbA2.ranked.length === 2 && lbA2.ranked.some((r) => r.id === adminA.e.id) && lbA2.ranked.some((r) => r.id === realA.e.id), "så fort en vanlig deltagare är bekräftad försvinner demotipparna men admin ligger kvar");
    await clearDemoData(db);
    check(Boolean(await db.entry.findUnique({ where: { id: adminA.e.id } })) && Boolean(await db.user.findUnique({ where: { id: adminA.u.id } })), "rensa demodata rör aldrig adminens konto eller deltagande");
    const sA2 = await mkSeason(2032);
    await mkEntry(sA2.id, { role: "ADMIN" });
    await mkEntry(sA2.id); // en vanlig deltagare
    const demoA2 = await loadDemoData(db, sA2.id, { recordSnapshot, production: false });
    check(!demoA2.ok && (await db.user.count({ where: { isDemo: true } })) === 0, "demodata nekas när en vanlig deltagare finns, även om en admin också finns");

    // ── B. Karantän av misstänkta tabeller
    console.log("  B. Misstänkt tabell");
    const sB = await mkSeason(2033);
    await mkEntry(sB.id); await mkEntry(sB.id); await mkEntry(sB.id);
    const garbage = fullRows.map((r) => ({ ...r, position: 0 }));
    const b1 = await applyStandings(sB.id, garbage, "API");
    check(b1.quarantined === true && !b1.recorded && (await db.standingSnapshot.count({ where: { seasonId: sB.id } })) === 0, "API-tabell utan placeringar sparas inte utan hamnar i karantän");
    check((await db.notification.count({ where: { audience: "ADMIN", title: { contains: "ser inte rätt ut" } } })) === 1, "admin får en notis om tabellen i karantän");
    await applyStandings(sB.id, garbage, "API");
    check((await db.notification.count({ where: { audience: "ADMIN", title: { contains: "ser inte rätt ut" } } })) === 1, "samma trasiga tabell ger inte en ny notis varje timme");
    check(Boolean(await getPendingStandings(sB.id)), "tabellen väntar på admins granskning");
    const dip = fullRows.map((r, i) => (i === 5 ? { ...r, points: r.points - 3 } : r)); // poängavdrag: lag 5 har 3 poäng för lite
    const dipSorted = [...dip].sort((a, b) => b.points - a.points || a.position - b.position).map((r, i) => ({ ...r, position: i + 1 }));
    const b2 = await applyStandings(sB.id, dipSorted, "MANUAL");
    check(!b2.recorded && (b2.issues?.length ?? 0) > 0, "manuell tabell med poäng som inte stämmer avvisas med förklaring");
    const b3 = await applyStandings(sB.id, dipSorted, "MANUAL", true, { force: true });
    check(b3.recorded && (await db.standingSnapshot.count({ where: { seasonId: sB.id } })) === 1, "'Spara ändå' sparar tabellen (t.ex. vid riktigt poängavdrag)");
    check(!(await getPendingStandings(sB.id)), "en sparad tabell ersätter den i karantän");
    const b4 = await applyStandings(sB.id, fullRows.map((r) => ({ ...r, played: r.played - 1, won: Math.max(0, r.won - (r.won > 0 ? 1 : 0)) })), "API");
    check(!b4.recorded, "tabell där spelade matcher minskar sparas inte");

    // ── C. Lås och samtidighet
    console.log("  C. Lås och samtidighet");
    const sC = await mkSeason(2034);
    await mkEntry(sC.id); await mkEntry(sC.id);
    const resultNotices = () => db.notification.count({ where: { type: "RESULTS" } });
    const noticesC = await resultNotices();
    await Promise.all([applyStandings(sC.id, fullRows, "API"), applyStandings(sC.id, fullRows, "API"), applyStandings(sC.id, fullRows, "API")]);
    check((await db.standingSnapshot.count({ where: { seasonId: sC.id } })) === 1, "tre samtidiga synkar med samma tabell ger exakt en tabell");
    check((await resultNotices()) === noticesC + 1, "… och exakt en notis");
    let active = 0, maxActive = 0;
    await Promise.all([1, 2, 3, 4].map(() => withLock("probe", async () => { active++; maxActive = Math.max(maxActive, active); await sleep(40); active--; })));
    check(maxActive === 1, "låset släpper bara in en åt gången");
    await db.setting.create({ data: { key: "lock:probe2", value: JSON.stringify({ id: "kraschad", until: Date.now() - 1000 }) } });
    const t0 = Date.now();
    await withLock("probe2", async () => {}, { waitMs: 2000 });
    check(Date.now() - t0 < 1500, "ett utgånget lån (krasch) tas över direkt");
    await db.setting.create({ data: { key: "lock:probe3", value: JSON.stringify({ id: "annan-process", until: Date.now() + 1200 }) } });
    let refused = false;
    try { await withLock("probe3", async () => {}, { waitMs: 300 }); } catch { refused = true; }
    check(refused, "ett lån som håller i sig får en annan körning att vänta och ge upp");
    const t1 = Date.now();
    await withLock("probe3", async () => {}, { waitMs: 5000 });
    check(Date.now() - t1 >= 300, "… men körs när lånet gått ut");

    // ── D. Atomär skrivning och reparation
    console.log("  D. Atomär skrivning");
    const sD = await mkSeason(2035);
    await mkEntry(sD.id); await mkEntry(sD.id);
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_lb BEFORE INSERT ON LeaderboardRow BEGIN SELECT RAISE(ABORT, 'simulerad krasch'); END;`);
    let crashed = false;
    try { await recordSnapshot(sD.id, fullRows, "MANUAL"); } catch { crashed = true; }
    await db.$executeRawUnsafe("DROP TRIGGER fail_lb");
    check(crashed && (await db.standingSnapshot.count({ where: { seasonId: sD.id } })) === 0, "krasch mitt i skrivningen lämnar ingen halv tabell (allt rullas tillbaka)");
    const snapD = await recordSnapshot(sD.id, fullRows, "MANUAL");
    await db.leaderboardRow.deleteMany({ where: { snapshotId: snapD.snapshot.id } }); // hål från en gammal krasch
    check((await repairLeaderboards(sD.id)) === 1 && (await db.leaderboardRow.count({ where: { snapshotId: snapD.snapshot.id } })) === 2, "en tabell utan tipstabell lagas");
    check((await repairLeaderboards(sD.id)) === 0, "… och lagningen är idempotent");

    // ── E. Säsongsavslut
    console.log("  E. Säsongsavslut");
    const sE = await mkSeason(2036);
    for (let i = 0; i < 3; i++) await mkEntry(sE.id);
    const adminNotices = () => db.notification.count({ where: { audience: "ADMIN", title: { contains: "Sista omgången" } } });
    const noticesBefore = await adminNotices();
    await applyStandings(sE.id, partialRows, "API");
    check(completedRound(partialRows) === 30, "omgång 30 räknas som färdigspelad när 14 av 16 lag spelat den");
    check((await adminNotices()) === noticesBefore, "ingen 'Sista omgången spelad' medan två lag har en match kvar");
    const chk = await finishCheck(sE.id);
    check(!chk.ready && chk.behind.length === 2, `avslut väntar på de ${chk.behind.length} lag som har en match kvar`);
    const early = await finalizeSeason(sE.id);
    check(!early.ok && !(await db.season.findUnique({ where: { id: sE.id } }))!.isFinished, "säsongen går inte att avsluta för tidigt");
    await applyStandings(sE.id, fullRows, "API");
    check((await adminNotices()) === noticesBefore + 1, "admin får 'Sista omgången spelad' först när alla lag spelat klart");
    check((await finishCheck(sE.id)).ready, "avslut är möjligt när alla lag spelat alla omgångar");
    const fin = await finalizeSeason(sE.id);
    const finalRes = await getFinalResult(sE.id);
    check(fin.ok && (await seasonFrozen(sE.id)) && Boolean(finalRes) && finalRes!.payouts.length === 3, "avslut fastställer slutresultatet och fryser säsongen");
    check((await db.notification.count({ where: { type: "RESULTS", title: { contains: "Test 2036 är avgjort" } } })) === 1, "prislistan skickas en gång");
    check(!(await applyStandings(sE.id, partialRows, "MANUAL")).recorded && (await applyStandings(sE.id, fullRows, "MANUAL")).blocked === true, "tabellen är frusen efter avslut");
    const syncFrozen = await (await import("../src/lib/football-api")).syncFromApi(sE.id);
    check(!syncFrozen.ok && /frusen/.test(syncFrozen.log.join(" ")), "automatisk synk rör inte en avslutad säsong");
    await reopenSeason(sE.id);
    check(!(await seasonFrozen(sE.id)) && !(await getFinalResult(sE.id)), "säsongen kan öppnas igen för rättning");
    await finalizeSeason(sE.id);
    check((await db.notification.count({ where: { type: "RESULTS", title: { contains: "Test 2036" } } })) === 1, "omavslut utan ändrad prislista skickar inget nytt");
    await reopenSeason(sE.id);
    const someone = (await db.entry.findMany({ where: { seasonId: sE.id } }))[0]!;
    await db.entry.update({ where: { id: someone.id }, data: { paymentStatus: "PENDING" } });
    await finalizeSeason(sE.id);
    check((await db.notification.count({ where: { type: "RESULTS", title: { contains: "rättat slutresultat" } } })) === 1, "ändrad prislista efter omöppning ger en rättelse");

    // ── F. Backup
    console.log("  F. Backup");
    const bk = await createBackup("test");
    check(existsSync(bk.file) && bk.bytes > 0, "backup skapas och komprimeras");
    const restored = path.join(process.env.BACKUP_DIR!, "aterstalld.db");
    writeFileSync(restored, gunzipSync(readFileSync(bk.file)));
    const v = await verifyDatabaseFile(restored);
    check(v.users === (await db.user.count()) && v.entries === (await db.entry.count()), `backupen går att läsa och innehåller allt (${v.users} konton, ${v.entries} deltaganden)`);
    for (let i = 0; i < 9; i++) await createBackup("natt");
    check((await listBackups()).filter((b) => b.reason === "natt").length === 7, "endast de 7 senaste nattliga backuperna sparas");
    check((await db.setting.findUnique({ where: { key: "lastBackup" } }))?.value.includes("natt") === true, "senaste backup noteras");

    // ── G. Övervakning
    console.log("  G. Övervakning");
    const sG = await db.season.create({
      data: { name: "Test 2037", year: 2037, isActive: false, totalRounds: 30, startDate: new Date(Date.now() - 3 * day), registrationDeadline: new Date(Date.now() - 10 * day), editDeadline: new Date(Date.now() - 5 * day) },
    });
    await db.setting.upsert({ where: { key: "lastSyncOkAt" }, create: { key: "lastSyncOkAt", value: new Date(Date.now() - 40 * 3.6e6).toISOString() }, update: { value: new Date(Date.now() - 40 * 3.6e6).toISOString() } });
    const staleNotices = () => db.notification.count({ where: { audience: "ADMIN", title: { contains: "inte kunnat hämtas" } } });
    await checkSyncHealth(sG);
    await checkSyncHealth(sG);
    check((await staleNotices()) === 1, "admin larmas en gång när tabellen är för gammal (inte var timme)");
    await db.setting.update({ where: { key: "lastSyncOkAt" }, data: { value: new Date().toISOString() } });
    await checkSyncHealth(sG);
    check((await db.notification.count({ where: { audience: "ADMIN", title: { contains: "uppdateras igen" } } })) === 1, "admin får besked när synken fungerar igen");
    const checks = await goLiveChecks(sG);
    check(checks.length >= 12 && checks.every((c) => c.label), `go-live-kontrollen ger ${checks.length} punkter`);

    // ── H. Åtkomst
    console.log("  H. Åtkomst och konfiguration");
    const paidNow = await mkEntry(sA.id); // deltar i den aktiva säsongen (2031)
    const paidLastYear = await mkEntry((await mkSeason(2030)).id);
    check(await isMember(paidNow.u), "betalande i årets tävling är medlem");
    check(!(await isMember(paidLastYear.u)), "betalning förra året ger ingen åtkomst i år");
    check(await isMember(adminA.u), "admin är alltid medlem");
    const env = process.env as Record<string, string | undefined>;
    const oldNodeEnv = env.NODE_ENV;
    await db.setting.upsert({ where: { key: "demoData" }, create: { key: "demoData", value: "true" }, update: { value: "true" } });
    const closed = { registrationDeadline: new Date(Date.now() - day) };
    env.NODE_ENV = "development";
    const openDev = await registrationOpen(closed);
    env.NODE_ENV = "production";
    const openProd = await registrationOpen(closed);
    env.NODE_ENV = oldNodeEnv;
    await db.setting.deleteMany({ where: { key: "demoData" } });
    check(openDev && !openProd, "demoflaggan håller anmälan öppen bara utanför drift");
    const oldKey = env.API_FOOTBALL_KEY, oldProv = env.FOOTBALL_PROVIDER;
    delete env.API_FOOTBALL_KEY; delete env.FOOTBALL_PROVIDER;
    const p1 = providerOrder().join();
    env.API_FOOTBALL_KEY = "x";
    const p2 = providerOrder().join();
    env.FOOTBALL_PROVIDER = "api-football";
    const p3 = providerOrder().join();
    if (oldKey === undefined) delete env.API_FOOTBALL_KEY; else env.API_FOOTBALL_KEY = oldKey;
    if (oldProv === undefined) delete env.FOOTBALL_PROVIDER; else env.FOOTBALL_PROVIDER = oldProv;
    check(p1 === "espn" && p2 === "espn,api-football" && p3 === "api-football,espn", "ESPN har API-Football som reserv när nyckel finns");

    // ── I. Tippning och deadline – tidsresa med styrbar klocka
    console.log("  I. Tippning och deadline (tidsresa)");
    const { saveTipFor } = await import("../src/lib/tip-save");
    const D = new Date(Date.now() + 3 * 3.6e6); // deadline om tre timmar (klockan styrs nedan)
    const sI = await db.season.create({
      data: { name: "Test 2038", year: 2038, isActive: true, totalRounds: 30, startDate: new Date(D.getTime() + 2 * day), registrationDeadline: D, editDeadline: D },
    });
    await db.season.updateMany({ where: { NOT: { id: sI.id } }, data: { isActive: false } });
    await db.seasonTeam.createMany({ data: teamIds.map((teamId) => ({ seasonId: sI.id, teamId })) });
    const scorerI = await db.player.create({ data: { seasonId: sI.id, teamId: teamIds[0]!, name: "Skytt I" } });
    const assistI = await db.player.create({ data: { seasonId: sI.id, teamId: teamIds[1]!, name: "Assist I" } });
    const otherSeasonPlayer = await db.player.create({ data: { seasonId: sA.id, teamId: teamIds[2]!, name: "Fel säsong" } });
    const paidI = await mkEntry(sI.id);
    await db.tipRow.deleteMany({ where: { entryId: paidI.e.id } });
    await db.entry.update({ where: { id: paidI.e.id }, data: { submittedAt: null } });
    const unpaidI = await mkEntry(sI.id, { status: "CLAIMED" });
    const adminI = (await db.user.create({ data: { email: "admin-i@test.se", name: "Admin I", passwordHash: "x", role: "ADMIN" } }));
    const order = (seed: number) => teamIds.map((id) => ({ id, k: createRng(seed)() + Math.random() })).sort((a, b) => a.k - b.k).map((x) => x.id);
    const at = (ms: number) => () => new Date(D.getTime() + ms);
    const rowsOf = async (entryId: string) => (await db.tipRow.findMany({ where: { entryId }, orderBy: { position: "asc" } })).map((r) => r.teamId).join();
    const good = order(1);

    let r = await saveTipFor(paidI.u, { order: good, topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(-3_600_000) });
    check(r.ok && r.complete && (await rowsOf(paidI.e.id)) === good.join() && Boolean((await db.entry.findUnique({ where: { id: paidI.e.id } }))!.submittedAt), "en timme före deadline sparas tipset");
    r = await saveTipFor(paidI.u, { order: order(2), topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(-1000) });
    check(r.ok, "en sekund före deadline sparas tipset");
    const saved = await rowsOf(paidI.e.id);
    r = await saveTipFor(paidI.u, { order: order(3), topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(0) });
    check(r.ok, "exakt på deadline-millisekunden sparas tipset (deadline gäller t.o.m.)");
    const savedAtDeadline = await rowsOf(paidI.e.id);
    r = await saveTipFor(paidI.u, { order: order(4), topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(1) });
    check(!r.ok && r.locked === true && (await rowsOf(paidI.e.id)) === savedAtDeadline, "en millisekund efter deadline nekas och tipset är oförändrat");
    r = await saveTipFor(paidI.u, { order: order(5), topScorerId: scorerI.id, topAssistId: assistI.id }, { receivedAt: at(-10)(), clock: at(5) });
    check(!r.ok && r.locked === true && (await rowsOf(paidI.e.id)) === savedAtDeadline, "ett anrop som kom in före deadline men hann skrivas efter den nekas (omkontroll före skrivning)");
    const unpaidBefore = await rowsOf(unpaidI.e.id);
    r = await saveTipFor(unpaidI.u, { order: good, topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(-1000) });
    check(!r.ok && !r.locked && (await rowsOf(unpaidI.e.id)) === unpaidBefore && unpaidBefore !== good.join(), "obekräftad betalning kan inte spara tips (direkt anrop)");
    r = await saveTipFor(adminI, { order: good, topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(-1000) });
    const adminEntry = await db.entry.findFirst({ where: { userId: adminI.id, seasonId: sI.id } });
    check(r.ok && adminEntry?.paymentStatus === "CLAIMED" && r.message.includes("bekräftat"), "adminens eget tips skapar ett deltagande som väntar på bekräftelse, inte en gratis plats");
    check((await computePrizes(sI.id)).participants === 1, "admin räknas inte som betalande i potten förrän betalningen bekräftats");
    r = await saveTipFor(adminI, { order: order(6), topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(1) });
    check(!r.ok && r.locked === true, "inte ens admin kan spara efter deadline");
    r = await saveTipFor(paidI.u, { order: order(7), topScorerId: null, topAssistId: null }, { clock: at(-500) });
    const inc = await db.entry.findUnique({ where: { id: paidI.e.id } });
    check(r.ok && !r.complete && inc!.submittedAt === null, "tips utan skytt och assistkung sparas men räknas inte som inlämnat");
    const dup = [...good];
    dup[3] = dup[0]!;
    const before = await rowsOf(paidI.e.id);
    r = await saveTipFor(paidI.u, { order: dup, topScorerId: scorerI.id, topAssistId: assistI.id }, { clock: at(-1000) });
    check(!r.ok && (await rowsOf(paidI.e.id)) === before, "tips med dubblerade lag avvisas och ändrar inget");
    r = await saveTipFor(paidI.u, { order: good, topScorerId: otherSeasonPlayer.id, topAssistId: assistI.id }, { clock: at(-1000) });
    check(!r.ok, "spelare från en annan säsong avvisas");
    void saved;
  }

  console.log("\nSäsongsbytet via säsongsguiden");
  {
    const { createNextSeason, teamCheck, swapTeams, tableBottom } = await import("../src/lib/season-admin");
    const { loadSeasonGuideState } = await import("../src/lib/season-guide-data");
    const { buildSeasonGuide } = await import("../src/lib/season-guide");
    const { recordSnapshot: record } = await import("../src/lib/season");
    const allTeams = await db.team.findMany({ where: { id: { in: teams.map((t) => t.id) } }, orderBy: { name: "asc" } });

    // En avslutad tävling 2050 med slutställning
    const dl = new Date("2050-04-03T21:59:59.999Z");
    const s50 = await db.season.create({
      data: { name: "Tips Allsvenskan 2050", year: 2050, entryFee: 123, swishNumber: "0700-000000", reservedAmount: 400, prizeSplit: "60,40", startDate: new Date("2050-04-05T13:00:00Z"), registrationDeadline: dl, editDeadline: dl },
    });
    await db.seasonTeam.createMany({ data: allTeams.map((t) => ({ seasonId: s50.id, teamId: t.id })) });
    await record(s50.id, allTeams.map((t, i) => ({ teamId: t.id, position: i + 1, played: 30, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 60 - i * 2, form: "" })), "MANUAL");
    await db.season.updateMany({ data: { isActive: false } });
    await db.season.update({ where: { id: s50.id }, data: { isActive: true, isFinished: true } });

    const bottom = await tableBottom(s50.id);
    check(bottom?.relegated.join(",") === `${allTeams[14]!.name},${allTeams[15]!.name}` && bottom?.playoff === allTeams[13]!.name, "guiden vet vilka lag som åker ur (15–16) och ska kvala (14)");
    const g1 = buildSeasonGuide(await loadSeasonGuideState((await db.season.findUniqueOrThrow({ where: { id: s50.id } })) as never));
    check(g1.mode === "finish" && g1.steps.find((s) => s.id === "next")?.state === "now", "avslutad säsong: guiden föreslår att skapa nästa års tävling");

    const running = await db.season.create({ data: { name: "Pågår 2060", year: 2060, startDate: new Date(), registrationDeadline: new Date(), editDeadline: new Date() } });
    check(!(await createNextSeason(running.id)).ok, "nästa års tävling kan inte skapas medan säsongen pågår");
    await db.season.delete({ where: { id: running.id } });

    const n = await createNextSeason(s50.id);
    check(n.ok, `nästa års tävling skapas${n.ok ? ` (${n.name})` : ` – ${n.error}`}`);
    const s51 = await db.season.findUniqueOrThrow({ where: { year: 2051 } });
    const s50after = await db.season.findUniqueOrThrow({ where: { id: s50.id } });
    check(s51.isActive && !s50after.isActive && s50after.isFinished, "den nya tävlingen är aktiv, den gamla är avslutad och orörd");
    check(s51.entryFee === 123 && s51.swishNumber === "0700-000000" && s51.reservedAmount === 400 && s51.prizeSplit === "60,40", "avgift, Swish, avsatt belopp och prisfördelning kopieras");
    check(s51.editDeadline.toISOString() === "2051-04-03T21:59:59.999Z", `sista tippdag blir samma svenska klockslag ett år senare (${s51.editDeadline.toISOString()})`);
    check((await db.seasonTeam.count({ where: { seasonId: s51.id } })) === 16, "alla 16 lag kopieras till nästa år");
    check(!(await createNextSeason(s50.id)).ok, "nästa års tävling kan inte skapas två gånger");

    // ESPN:s laglista (påhittad): två av våra lag borta, två nya in
    const espnOf = (list: { espnId: number; name: string }[]) =>
      list.map((t) => ({ espnId: t.espnId, name: t.name, shortName: t.name.slice(0, 3).toUpperCase(), logo: null, color: "#112233", altColor: "#ffeedd" }));
    const withIds = await db.team.findMany({ where: { id: { in: allTeams.map((t) => t.id) } } });
    const ours = withIds.map((t) => ({ espnId: t.espnId!, name: t.name }));
    const newcomers = [{ espnId: 9001, name: "Nykomling FF" }, { espnId: 9002, name: "Uppflyttad IF" }];
    const relegated = withIds.filter((t) => [allTeams[14]!.id, allTeams[15]!.id].includes(t.id));
    const espnList = espnOf([...ours.filter((t) => !relegated.some((r) => r.espnId === t.espnId)), ...newcomers]);
    const prevIds = allTeams.map((t) => t.id);
    const diff = await teamCheck(s51.id, espnList, prevIds);
    check(diff.status === "diff" && diff.out.length === 2 && diff.in.length === 2, "guiden ser att två lag ska ut och två in");
    check((await teamCheck(s51.id, espnOf(ours), prevIds)).status === "stale", "visar ESPN fortfarande förra årets lag föreslås inget byte");
    check((await teamCheck(s51.id, null, prevIds)).status === "unknown", "går ESPN inte att nå säger guiden det i stället för att gissa");

    // Någon har redan tippat med ett lag som skulle bort → bytet vägras
    const tipper = await db.user.create({ data: { email: "guidetest@test.se", name: "Guide Test", passwordHash: "x" } });
    const e = await db.entry.create({ data: { userId: tipper.id, seasonId: s51.id, paymentStatus: "CONFIRMED", rows: { create: allTeams.map((t, i) => ({ teamId: t.id, position: i + 1 })) } } });
    const outIds = diff.status === "diff" ? diff.out.map((t) => t.id) : [];
    const inTeams = diff.status === "diff" ? diff.in : [];
    const refused = await swapTeams(s51.id, outIds, inTeams);
    check(!refused.ok && (await db.seasonTeam.count({ where: { seasonId: s51.id } })) === 16, "lag som redan finns i någons tips byts inte ut (inget ändras)");
    await db.entry.delete({ where: { id: e.id } });
    await db.user.delete({ where: { id: tipper.id } });

    const swapped = await swapTeams(s51.id, outIds, inTeams);
    check(swapped.ok, "lagen byts när ingen har tippat");
    const s51teams = await db.seasonTeam.findMany({ where: { seasonId: s51.id }, include: { team: true } });
    check(s51teams.length === 16 && s51teams.some((t) => t.team.name === "Nykomling FF") && !s51teams.some((t) => outIds.includes(t.teamId)), "tävlingen har 16 lag: de nya in, de nedflyttade ut");
    const nk = s51teams.find((t) => t.team.name === "Nykomling FF")!.team;
    check(nk.espnId === 9001 && nk.primaryColor === "#112233", "nya lag får ESPN-id och färger från ESPN");
    check((await db.seasonTeam.count({ where: { seasonId: s50.id } })) === 16 && (await db.seasonTeam.count({ where: { seasonId: s50.id, teamId: { in: outIds } } })) === 2, "förra årets tävling behåller sina lag");
    check((await teamCheck(s51.id, espnList, prevIds)).status === "ok", "efter bytet stämmer lagen med ESPN");
    check(!(await swapTeams(s51.id, [s51teams[0]!.teamId], [])).ok, "ett byte som skulle ge fel antal lag vägras");
  }

  console.log(failures ? `\n✗ ${failures} kontroll(er) misslyckades` : "\n✓ Alla kontroller gick igenom");
  await db.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
