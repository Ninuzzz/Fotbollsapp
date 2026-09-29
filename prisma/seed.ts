/**
 * Seed för Allsvenskantipset.
 *
 * RIKTIG DATA:  2026 års tabell (omgång 22), Hall of Fame 2015–2025, 2024 års slutresultat + placering per omgång.
 * DEMO-DATA:    tippare, tips, chatt och exempelodds (spelare/statistik hämtas live från ESPN om nätet finns) – markeras i appen och kan rensas i admin.
 *
 * Inloggningar (endast lokal utveckling):
 *   Admin:  anders@allsvenskantipset.se / SEED_ADMIN_PASSWORD (default "anders2026")
 *   Demo:   demo@allsvenskantipset.se   / "tipset2026"
 * I drift (NODE_ENV=production) krävs SEED_ADMIN_PASSWORD, och demokontona får slumpade lösenord.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TEAMS_2026, TEAMS_EARLIER } from "../src/lib/teams-data";
import { recordSnapshot } from "../src/lib/season";
import { applyPlayerPhotos } from "../src/lib/player-photo-archive";
import { loadDemoData } from "../src/lib/demo-data";
import { espnLeaders, espnSquads, espnStandings, fillPlayerPhotos } from "../src/lib/espn";

const db = new PrismaClient();


// Tabell efter omgång 22, 2026 (från allsvenskan-skärmdump)
const TABLE_2026: [string, number, number, number, number, number, number, string][] = [
  // lag, W, D, L, GF, GA, P, form (äldst→nyast)
  ["IK Sirius", 16, 3, 3, 52, 28, 51, "LLWWW"],
  ["Hammarby IF", 13, 4, 5, 49, 20, 43, "WLDWW"],
  ["Djurgårdens IF", 13, 2, 7, 47, 21, 41, "WWWWL"],
  ["IF Elfsborg", 10, 7, 5, 31, 22, 37, "DWLWW"],
  ["BK Häcken", 9, 9, 4, 39, 30, 36, "WLDDW"],
  ["Västerås SK", 10, 5, 7, 34, 35, 35, "DWLWW"],
  ["Malmö FF", 10, 3, 9, 37, 33, 33, "LWDWL"],
  ["AIK", 9, 6, 7, 31, 34, 33, "WDLDL"],
  ["IFK Göteborg", 9, 5, 8, 31, 41, 32, "DWWWW"],
  ["GAIS", 8, 6, 8, 28, 20, 30, "LWDLW"],
  ["IF Brommapojkarna", 7, 6, 9, 30, 36, 27, "WLWWL"],
  ["Mjällby AIF", 5, 7, 10, 27, 38, 22, "LLDDD"],
  ["Kalmar FF", 5, 4, 13, 21, 36, 19, "DLLLL"],
  ["Degerfors IF", 5, 4, 13, 19, 34, 19, "LLWLL"],
  ["Örgryte IS", 3, 6, 13, 25, 49, 15, "DLDLL"],
  ["Halmstad BK", 3, 5, 14, 16, 40, 14, "DWLLW"],
];

// Demo-spelare: [namn, lag, mål, assist]
const PLAYERS: [string, string, number, number][] = [
  ["Priske", "Djurgårdens IF", 13, 4],
  ["Tokmac Nguen", "Djurgårdens IF", 8, 9],
  ["Hümmet", "Djurgårdens IF", 7, 3],
  ["Kiese Thelin", "Malmö FF", 11, 3],
  ["Botheim", "Malmö FF", 6, 5],
  ["Christiansen", "Malmö FF", 3, 7],
  ["Pittas", "AIK", 9, 4],
  ["Kakoullis", "AIK", 5, 2],
  ["Erabi", "Hammarby IF", 12, 6],
  ["Besara", "Hammarby IF", 6, 10],
  ["Fenger", "IFK Göteborg", 7, 6],
  ["Hrstić", "BK Häcken", 10, 3],
  ["Jeremejeff", "BK Häcken", 8, 2],
  ["Rygaard", "BK Häcken", 2, 8],
  ["Vasic", "IF Brommapojkarna", 9, 3],
  ["Johansson", "Mjällby AIF", 4, 9],
  ["Oscar Lundgren", "IK Sirius", 15, 5],
  ["Viktor Hedlund", "IK Sirius", 9, 11],
  ["Adam Berglöf", "IF Elfsborg", 8, 4],
  ["Samuel Ekdahl", "Västerås SK", 10, 4],
  ["Isak Norrgård", "GAIS", 7, 5],
  ["Leo Strandberg", "Kalmar FF", 6, 2],
  ["Elias Wennberg", "Degerfors IF", 5, 3],
  ["Hugo Tallberg", "Örgryte IS", 7, 2],
  ["Nils Ahlgren", "Halmstad BK", 4, 3],
];



async function main() {
  // Seeden raderar ALLT. I drift får den bara köras mot en tom databas (eller med SEED_FORCE=true).
  if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "true" && (await db.user.count()) > 0) {
    throw new Error("Databasen har redan användare. Seeden skulle radera allt, så den avbryts. (SEED_FORCE=true tvingar.)");
  }
  console.log("Rensar databasen …");
  // Ordning spelar roll pga relationer
  await db.$transaction([
    db.award.deleteMany(), db.leaderboardRow.deleteMany(), db.standingRow.deleteMany(), db.standingSnapshot.deleteMany(),
    db.tipRow.deleteMany(), db.entry.deleteMany(), db.player.deleteMany(), db.oddsQuote.deleteMany(),
    db.chatMessage.deleteMany(), db.notificationRead.deleteMany(), db.notification.deleteMany(),
    db.pushSubscription.deleteMany(), db.follow.deleteMany(), db.session.deleteMany(),
    db.hallOfFame.deleteMany(), db.historicalResult.deleteMany(), db.seasonTeam.deleteMany(),
    db.season.deleteMany(), db.user.deleteMany(), db.team.deleteMany(), db.setting.deleteMany(),
  ]);

  console.log("Lag …");
  const teamByName = new Map<string, { id: string }>();
  for (const t of [...TEAMS_2026, ...TEAMS_EARLIER]) {
    const row = await db.team.create({
      data: { name: t.name, shortName: t.shortName, aliases: t.aliases.join(","), primaryColor: t.primaryColor, secondaryColor: t.secondaryColor },
    });
    teamByName.set(t.name, row);
  }
  const T = (n: string) => teamByName.get(n)!.id;

  console.log("Säsonger …");
  const s2025 = await db.season.create({
    data: {
      name: "Tips Allsvenskan 2025", year: 2025, entryFee: 100, isActive: false, isFinished: true,
      startDate: new Date("2025-03-29"), registrationDeadline: new Date("2025-03-28T23:59:00+01:00"), editDeadline: new Date("2025-03-28T23:59:00+01:00"),
    },
  });
  void s2025;
  const season = await db.season.create({
    data: {
      name: "Tips Allsvenskan 2026", year: 2026, entryFee: 111, swishNumber: "0733-364314", reservedAmount: 600, isActive: true,
      startDate: new Date("2026-04-05T15:00:00+02:00"),
      registrationDeadline: new Date("2026-04-03T23:59:00+02:00"),
      editDeadline: new Date("2026-04-03T23:59:00+02:00"),
    },
  });
  await db.seasonTeam.createMany({ data: TEAMS_2026.map((t) => ({ seasonId: season.id, teamId: T(t.name) })) });

  // Riktiga spelare + logotyper från ESPN om nätet finns, annars demolista
  let players: Awaited<ReturnType<typeof db.player.findMany>> = [];
  let tableRows: Parameters<typeof recordSnapshot>[1] | null = null;
  try {
    console.log("Hämtar logotyper, tabell, skytteliga och assistliga från ESPN …");
    tableRows = (await espnStandings(season.id, 2026)).rows;
    await espnLeaders(season.id, 2026);
    // Hela trupperna, så att alla spelare (och deras sparade foton) finns från start
    console.log("Trupper:", await espnSquads(season.id).catch((e) => `ej nåbart (${(e as Error).message})`));
    players = await db.player.findMany({ where: { seasonId: season.id } });
  } catch (e) {
    console.log("ESPN ej nåbart – använder sparad tabell och demospelare.", (e as Error).message);
  }
  if (players.length < 10) {
    console.log("Spelare (demo-statistik) …");
    const demoPlayers = [];
    for (const [name, team, goals, assists] of PLAYERS)
      demoPlayers.push(await db.player.create({ data: { seasonId: season.id, teamId: T(team), name, goals, assists } }));
    players.push(...demoPlayers);
    // Kom ihåg exakt vilka spelare som är påhittade, så att "Rensa demodata" bara tar bort dem
    await db.setting.create({ data: { key: "demoPlayerIds", value: JSON.stringify(demoPlayers.map((p) => p.id)) } });
  }

  // Sparade spelarfoton från repot (public/players) först, TheSportsDB för resten
  console.log("Spelarfoton (arkiv):", await applyPlayerPhotos(db));
  if (!process.env.SEED_NO_PHOTOS) console.log("Spelarfoton (TheSportsDB):", await fillPlayerPhotos(season.id, 30).catch(() => "ej nåbart"));

  // Aktuell tabell (riktig): från ESPN, annars den sparade efter omgång 22
  if (!tableRows || !tableRows.some((r) => r.played > 0))
    tableRows = TABLE_2026.map(([name, w, d, l, gf, ga, pts, form], i) => ({
      teamId: T(name), position: i + 1, played: 22, won: w, drawn: d, lost: l, goalsFor: gf, goalsAgainst: ga, points: pts, form,
    }));
  await recordSnapshot(season.id, tableRows, "MANUAL");

  console.log("Användare …");
  // I drift får inga kända standardlösenord finnas: adminlösenordet måste anges, demokontona får slumpade lösenord
  const prod = process.env.NODE_ENV === "production";
  const adminPw = process.env.SEED_ADMIN_PASSWORD ?? (prod ? "" : "anders2026");
  if (prod && adminPw.length < 12) throw new Error("Sätt SEED_ADMIN_PASSWORD (minst 12 tecken) innan du seedar i drift.");
  const adminHash = await bcrypt.hash(adminPw, 11);
  const admin = await db.user.create({
    data: { email: "anders@allsvenskantipset.se", name: "Anders", role: "ADMIN", passwordHash: adminHash, favoriteTeamId: T("Malmö FF"), avatar: "jersey:stripes:#38bdf8:#ffffff:1" },
  });
  void admin;

  console.log("Demodata …");
  const demo = await loadDemoData(db, season.id, { recordSnapshot, production: prod });
  console.log(demo.ok ? demo.message : `Ingen demodata: ${demo.error}`);
  await db.notification.createMany({
    data: [{ type: "GENERAL", title: `Välkommen till ${season.name}!`, body: "Nu är årets tips igång. Lycka till allihop. /Anders", authorId: admin.id }],
  });

  console.log("Hall of Fame + historik …");
  const heroes: [number, string, string, string][] = [
    [2015, "Martin Avander", "/heroes/2015.png", "Den allra första mästaren. Satte ribban direkt."],
    [2016, "Håkan Strandh", "/heroes/2016.png", "Tre tippare på samma poäng, men skytteligavinnaren avgjorde till Håkans fördel."],
    [2017, "Anders Hulthin", "/heroes/2017.webp", "Skytteligavinnaren skiljde plats 1 och 2 åt."],
    [2018, "Tina Magnusson", "/heroes/2018.webp", "Stabil hela säsongen och en välförtjänt mugg."],
    [2019, "Svenolof Åsenlund", "/heroes/2019.webp", "Första titeln för tipsets enda dubbelmästare."],
    [2020, "Micael Simonsson", "/heroes/2020.webp", "Pandemiåret och en mästare med järnkoll."],
    [2021, "Christian Zock", "/heroes/2021.webp", "Tog hem vandringspriset med stil."],
    [2022, "Svenolof Åsenlund", "/heroes/2022.webp", "Tillbaka på tronen, nu som tvåfaldig mästare!"],
    [2023, "Helena Arph", "/heroes/2023.webp", "Julklappen kom tidigt det året."],
    [2024, "Ulf Carlsson", "/heroes/2024.png", "Vann på 42 fel, två fel före tvåan."],
    [2025, "Johan Åhlander", "/heroes/2025.png", "Från näst sist 2024 till mästare 2025. Årets comeback!"],
  ];
  for (const [year, name, imageUrl, description] of heroes)
    // GDPR: samtycke måste samlas in – dolt publikt tills admin bockar i "Samtycke"
    await db.hallOfFame.create({
      data: { year, name, imageUrl, description, errors: year === 2024 ? 42 : null, consent: process.env.SEED_HEROES_CONSENT === "true" },
    });

  const hist = JSON.parse(readFileSync(join(__dirname, "data", "history-2024.json"), "utf-8")) as {
    results: { name: string; rank: number; errors: number; scorerGoals: number; exact: number; rankHistory: (number | null)[] }[];
  };
  for (const r of hist.results)
    await db.historicalResult.create({
      data: { year: 2024, name: r.name, rank: r.rank, errors: r.errors, exact: r.exact, scorerGoals: r.scorerGoals, rankHistory: JSON.stringify(r.rankHistory) },
    });

  console.log(`Klart! ${await db.user.count()} användare, ${await db.player.count()} spelare, ${hist.results.length} historiska resultat.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
