"use server";

/**
 * Alla adminåtgärder. VARJE funktion börjar med `admin()`, eftersom Server Actions
 * är publika POST-endpoints och måste behörighetskontrolleras var för sig.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { getActiveSeason, getSeasonTeams, recordSnapshot } from "@/lib/season";
import { sendNotification, type Audience, type NotificationType } from "@/lib/notify";
import { announceUpdate, syncFromApi, syncSquads, testApiFootball } from "@/lib/football-api";
import { fillPlayerPhotos } from "@/lib/espn";
import { oddsApiEnabled, syncOdds } from "@/lib/odds";
import { isSafeDataImage, isSafeUrl } from "@/lib/security";
import { fromLocalInput } from "@/lib/format";

type Result = { ok: boolean; message?: string; error?: string };

async function admin() {
  const u = await apiUser(true);
  if (!u) throw new Error("Behörighet saknas");
  return u;
}

const done = (message: string, ...paths: string[]): Result => {
  for (const p of paths.length ? paths : ["/admin"]) revalidatePath(p, "layout");
  return { ok: true, message };
};

const imageField = z
  .string()
  .max(1_200_000)
  .refine((v) => v === "" || isSafeUrl(v) || isSafeDataImage(v, 800_000), "Ogiltig bild")
  .transform((v) => v || null);

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// ─── Tävlingar ────────────────────────────────────────────────────────────

const seasonSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(3).max(80),
  year: z.coerce.number().int().min(2000).max(2100),
  startDate: z.string().min(10),
  registrationDeadline: z.string().min(10),
  editDeadline: z.string().min(10),
  entryFee: z.coerce.number().int().min(0).max(10000),
  swishNumber: z.string().trim().max(20),
  reservedAmount: z.coerce.number().int().min(0).max(100000),
  prizeSplit: z.string().regex(/^\d+(,\d+)*$/, "Ange t.ex. 50,30,20"),
  totalRounds: z.coerce.number().int().min(1).max(60),
  copyTeamsFrom: z.string().max(40).optional(),
});

export async function saveSeason(input: z.input<typeof seasonSchema>): Promise<Result> {
  await admin();
  const p = seasonSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const { id, copyTeamsFrom, ...d } = p.data;
  const data = {
    ...d,
    startDate: fromLocalInput(d.startDate),
    registrationDeadline: fromLocalInput(d.registrationDeadline),
    editDeadline: fromLocalInput(d.editDeadline),
  };
  if (data.editDeadline > data.startDate) return { ok: false, error: "Sista editeringsdag bör vara före seriestart." };
  let season;
  if (id) season = await db.season.update({ where: { id }, data });
  else {
    if (await db.season.findUnique({ where: { year: d.year } })) return { ok: false, error: "Det finns redan en tävling för det året." };
    season = await db.season.create({ data });
  }
  // Återanvänd lag (och spelarlista) från tidigare år
  if (copyTeamsFrom) {
    const teams = await db.seasonTeam.findMany({ where: { seasonId: copyTeamsFrom } });
    for (const t of teams)
      await db.seasonTeam.upsert({
        where: { seasonId_teamId: { seasonId: season.id, teamId: t.teamId } },
        create: { seasonId: season.id, teamId: t.teamId },
        update: {},
      });
  }
  return done(id ? "Tävlingen är uppdaterad." : `${d.name} är skapad.`);
}

export async function activateSeason(id: string): Promise<Result> {
  await admin();
  await db.$transaction([db.season.updateMany({ data: { isActive: false } }), db.season.update({ where: { id }, data: { isActive: true } })]);
  return done("Aktiv tävling bytt.", "/");
}

export async function finishSeason(id: string, finished: boolean): Promise<Result> {
  await admin();
  await db.season.update({ where: { id }, data: { isFinished: finished } });
  return done(finished ? "Säsongen är avslutad." : "Säsongen är öppnad igen.", "/");
}

// ─── Lag ──────────────────────────────────────────────────────────────────

const teamSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2).max(60),
  shortName: z.string().trim().min(1).max(6),
  aliases: z.string().max(300),
  primaryColor: hex,
  secondaryColor: hex,
  logoUrl: imageField,
  starPlayer: z.string().trim().max(60).transform((v) => v || null),
  starPlayerPhoto: imageField,
  inSeason: z.boolean(),
});

export async function saveTeam(input: z.input<typeof teamSchema>): Promise<Result> {
  await admin();
  const p = teamSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const { id, inSeason, ...data } = p.data;
  const team = id ? await db.team.update({ where: { id }, data }) : await db.team.create({ data });
  const season = await getActiveSeason();
  if (season) {
    const key = { seasonId_teamId: { seasonId: season.id, teamId: team.id } };
    if (inSeason) await db.seasonTeam.upsert({ where: key, create: { seasonId: season.id, teamId: team.id }, update: {} });
    else await db.seasonTeam.deleteMany({ where: { seasonId: season.id, teamId: team.id } });
  }
  return done(`${team.name} är sparat.`, "/");
}

// ─── Spelare ──────────────────────────────────────────────────────────────

const playerSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(2).max(60),
  teamId: z.string().max(40),
  goals: z.coerce.number().int().min(0).max(99),
  assists: z.coerce.number().int().min(0).max(99),
  photoUrl: imageField,
});

export async function savePlayer(input: z.input<typeof playerSchema>): Promise<Result> {
  await admin();
  const season = await getActiveSeason();
  if (!season) return { ok: false, error: "Ingen aktiv säsong" };
  const p = playerSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const { id, ...data } = p.data;
  try {
    if (id) await db.player.update({ where: { id, seasonId: season.id }, data });
    else await db.player.create({ data: { ...data, seasonId: season.id } });
  } catch {
    return { ok: false, error: "Spelaren finns redan i det laget." };
  }
  return done("Spelaren är sparad.", "/");
}

export async function deletePlayer(id: string): Promise<Result> {
  await admin();
  const used = await db.entry.count({ where: { OR: [{ topScorerId: id }, { topAssistId: id }] } });
  if (used) return { ok: false, error: `Spelaren är tippad av ${used} deltagare och kan inte tas bort.` };
  await db.player.delete({ where: { id } });
  return done("Spelaren är borttagen.");
}

// ─── Tabell (manuell) ─────────────────────────────────────────────────────

const rowSchema = z.object({
  teamId: z.string().max(40),
  played: z.coerce.number().int().min(0).max(60),
  won: z.coerce.number().int().min(0).max(60),
  drawn: z.coerce.number().int().min(0).max(60),
  lost: z.coerce.number().int().min(0).max(60),
  goalsFor: z.coerce.number().int().min(0).max(300),
  goalsAgainst: z.coerce.number().int().min(0).max(300),
  points: z.coerce.number().int().min(0).max(200),
});

export async function saveStandings(input: { rows: z.input<typeof rowSchema>[]; notify: boolean }): Promise<Result> {
  await admin();
  const season = await getActiveSeason();
  if (!season) return { ok: false, error: "Ingen aktiv säsong" };
  const rows = z.array(rowSchema).safeParse(input.rows);
  if (!rows.success) return { ok: false, error: "Kontrollera siffrorna i tabellen." };
  const teams = await getSeasonTeams(season.id);
  const ids = new Set(rows.data.map((r) => r.teamId));
  if (rows.data.length !== teams.length || ids.size !== teams.length || !teams.every((t) => ids.has(t.id)))
    return { ok: false, error: "Alla lag måste finnas med exakt en gång." };
  const result = await recordSnapshot(
    season.id,
    rows.data.map((r, i) => ({ ...r, position: i + 1 })),
    "MANUAL",
  );
  if (input.notify) await announceUpdate(season.id, result.snapshot.round, result.awards);
  return done(`Tabellen efter omgång ${result.snapshot.round} är sparad och tipstabellen omräknad.`, "/");
}

// ─── Deltagare ────────────────────────────────────────────────────────────

export async function setPayment(entryId: string, status: "PENDING" | "CLAIMED" | "CONFIRMED"): Promise<Result> {
  await admin();
  if (!["PENDING", "CLAIMED", "CONFIRMED"].includes(status)) return { ok: false };
  const entry = await db.entry.update({
    where: { id: entryId },
    data: { paymentStatus: status, paidAt: status === "CONFIRMED" ? new Date() : null },
    include: { season: true },
  });
  if (status === "CONFIRMED") {
    await sendNotification({
      type: "GENERAL",
      audience: "USER",
      targetUserId: entry.userId,
      title: "Betalningen är bekräftad!",
      body: `Välkommen till ${entry.season.name}. Nu kan du spara ditt tips och snacka i chatten.`,
      link: "/tipsa",
    });
  }
  return done(status === "CONFIRMED" ? "Betalningen är bekräftad och spelaren har fått en notis." : "Betalstatus uppdaterad.", "/");
}

export async function setFreeEntry(entryId: string, free: boolean): Promise<Result> {
  await admin();
  await db.entry.update({ where: { id: entryId }, data: { freeEntry: free } });
  return done("Uppdaterat.", "/");
}

export async function setRole(userId: string, role: "USER" | "ADMIN"): Promise<Result> {
  const me = await admin();
  if (userId === me.id) return { ok: false, error: "Du kan inte ändra din egen roll." };
  if (!["USER", "ADMIN"].includes(role)) return { ok: false };
  await db.user.update({ where: { id: userId }, data: { role } });
  // Logga ut användaren så att nya rättigheter gäller direkt
  await db.session.deleteMany({ where: { userId } });
  return done("Rollen är ändrad.");
}

export async function deleteEntry(entryId: string): Promise<Result> {
  await admin();
  await db.entry.delete({ where: { id: entryId } });
  return done("Deltagandet är borttaget.", "/");
}

// ─── Utskick ──────────────────────────────────────────────────────────────

const notifSchema = z.object({
  type: z.enum(["GENERAL", "NEWS", "DEADLINE", "RESULTS"]),
  audience: z.enum(["ALL", "PAID", "MISSING_TIPS"]),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(4000),
  imageUrl: imageField,
  link: z
    .string()
    .max(500)
    .refine((v) => v === "" || isSafeUrl(v), "Ogiltig länk")
    .transform((v) => v || null),
});

export async function sendAdminNotification(input: z.input<typeof notifSchema>): Promise<Result> {
  const me = await admin();
  const p = notifSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const season = await getActiveSeason();
  const r = await sendNotification({
    ...p.data,
    type: p.data.type as NotificationType,
    audience: p.data.audience as Audience,
    seasonId: season?.id,
    authorId: me.id,
  });
  return done(`Utskicket är publicerat${r.pushed ? ` och skickat som push till ${r.pushed} enheter` : ""}.`, "/");
}

export async function deleteNotification(id: string): Promise<Result> {
  await admin();
  await db.notification.delete({ where: { id } });
  return done("Utskicket är borttaget.", "/");
}

// ─── Heroes & historik ────────────────────────────────────────────────────

const heroSchema = z.object({
  id: z.string().max(40).optional(),
  year: z.coerce.number().int().min(2000).max(2100),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600),
  imageUrl: imageField,
  errors: z.coerce.number().int().min(0).max(200).nullable().optional(),
  consent: z.boolean().default(false),
});

export async function saveHero(input: z.input<typeof heroSchema>): Promise<Result> {
  await admin();
  const p = heroSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const { id, ...data } = p.data;
  try {
    if (id) await db.hallOfFame.update({ where: { id }, data });
    else await db.hallOfFame.create({ data });
  } catch {
    return { ok: false, error: "Det finns redan en vinnare för det året." };
  }
  return done("Hero sparad.", "/heroes", "/");
}

export async function deleteHero(id: string): Promise<Result> {
  await admin();
  await db.hallOfFame.delete({ where: { id } });
  return done("Borttagen.", "/heroes");
}

/** Import av slutresultat: en rad per tippare, "År;Namn;Placering;Fel" */
export async function importHistory(text: string): Promise<Result> {
  await admin();
  if (text.length > 200_000) return { ok: false, error: "För mycket text" };
  let n = 0;
  const errors: string[] = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const [y, name, rank, errs] = line.split(/[;\t]/).map((s) => s.trim());
    const row = { year: Number(y), name, rank: Number(rank), errors: Number(errs) };
    if (!row.name || ![row.year, row.rank, row.errors].every(Number.isInteger) || row.name.length > 80) {
      errors.push(`Rad ${i + 1}`);
      continue;
    }
    await db.historicalResult.upsert({
      where: { year_name: { year: row.year, name: row.name } },
      create: row,
      update: { rank: row.rank, errors: row.errors },
    });
    n++;
  }
  return done(`${n} resultat importerade.${errors.length ? ` Hoppade över: ${errors.slice(0, 5).join(", ")}` : ""}`, "/heroes");
}

/** Arkivera en avslutad säsong till historiken (för all-time-statistik) */
export async function archiveSeason(seasonId: string): Promise<Result> {
  await admin();
  const season = await db.season.findUniqueOrThrow({ where: { id: seasonId } });
  const { computeLeaderboard, rankHistory } = await import("@/lib/season");
  const { ranked } = await computeLeaderboard(seasonId);
  const hist = await rankHistory(seasonId);
  for (const r of ranked) {
    const data = {
      rank: r.rank,
      errors: r.errors,
      exact: r.exact,
      scorerGoals: r.scorerGoals,
      userId: r.user.id,
      rankHistory: JSON.stringify(hist.map((h) => h.ranks[r.id] ?? null)),
    };
    // Nyckeln är kontot, inte namnet: två spelare med samma namn får inte skriva över varandras resultat.
    // (Tabellen är unik på år + namn för Excel-importen, så en namnkrock får ett särskiljande tillägg.)
    const existing = await db.historicalResult.findFirst({ where: { year: season.year, userId: r.user.id } });
    if (existing) {
      await db.historicalResult.update({ where: { id: existing.id }, data });
      continue;
    }
    let name = r.user.name;
    for (let n = 2; await db.historicalResult.findUnique({ where: { year_name: { year: season.year, name } } }); n++) name = `${r.user.name} (${n})`;
    await db.historicalResult.create({ data: { year: season.year, name, ...data } });
  }
  return done(`${ranked.length} resultat från ${season.year} är arkiverade.`, "/heroes");
}

// ─── Odds ─────────────────────────────────────────────────────────────────

const oddsSchema = z.object({
  bookmaker: z.string().trim().min(2).max(40),
  odds: z.record(z.string().max(40), z.coerce.number().min(1.01).max(10000)),
});

export async function saveOdds(input: z.input<typeof oddsSchema>): Promise<Result> {
  await admin();
  const season = await getActiveSeason();
  if (!season) return { ok: false };
  const p = oddsSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Odds måste vara tal över 1.01" };
  const teamIds = new Set((await getSeasonTeams(season.id)).map((t) => t.id));
  for (const [teamId, odds] of Object.entries(p.data.odds)) {
    if (!teamIds.has(teamId)) continue;
    await db.oddsQuote.upsert({
      where: { seasonId_teamId_bookmaker_market: { seasonId: season.id, teamId, bookmaker: p.data.bookmaker, market: "WINNER" } },
      create: { seasonId: season.id, teamId, bookmaker: p.data.bookmaker, market: "WINNER", odds, source: "MANUAL" },
      update: { odds, source: "MANUAL" },
    });
  }
  return done(`Odds från ${p.data.bookmaker} sparade.`, "/tipsa");
}

export async function deleteBookmaker(bookmaker: string): Promise<Result> {
  await admin();
  const season = await getActiveSeason();
  if (!season) return { ok: false };
  await db.oddsQuote.deleteMany({ where: { seasonId: season.id, bookmaker } });
  return done(`${bookmaker} borttaget.`, "/tipsa");
}

// ─── Synk & underhåll ─────────────────────────────────────────────────────

export async function runSync(what: "standings" | "squads" | "odds" | "photos" | "test-af"): Promise<Result> {
  await admin();
  const season = await getActiveSeason();
  if (!season) return { ok: false, error: "Ingen aktiv säsong" };
  try {
    if (what === "odds") {
      if (!oddsApiEnabled()) return { ok: false, error: "ODDS_API_KEY saknas i miljön – lägg in odds manuellt nedan." };
      const n = await syncOdds(season.id);
      return done(`${n} odds hämtade.`, "/tipsa");
    }
    if (what === "test-af") return { ok: true, message: await testApiFootball(season.year, season.apiLeagueId) };
    if (what === "photos") {
      const r = await fillPlayerPhotos(season.id, 40);
      return done(`${r.found} nya foton av ${r.checked} kontrollerade spelare.`);
    }
    if (what === "squads") {
      const r = await syncSquads(season.id);
      return done(`${r.players} spelare från ${r.teams} lag hämtade.`);
    }
    const r = await syncFromApi(season.id);
    return r.ok ? done(r.log.join(" · "), "/") : { ok: false, error: r.log.join(" · ") };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 300) };
  }
}

export async function sendDeadlineReminder(): Promise<Result> {
  await admin();
  const season = await getActiveSeason();
  if (!season) return { ok: false };
  const { remindMissing } = await import("@/lib/reminders");
  const r = await remindMissing(season, true);
  return done(r);
}

/** Tar bort demodata från seeden – behåller lag, säsonger, admin, Hall of Fame och historik */
export async function clearDemoData(): Promise<Result> {
  const me = await admin();
  // Endast i demoläge – rör aldrig riktiga användare som registrerat sig själva
  if ((await db.setting.findUnique({ where: { key: "demoData" } }))?.value !== "true") return { ok: false, error: "Ingen demodata finns." };
  const demoUsers = { email: { endsWith: "@allsvenskantipset.se" } };
  let demoPlayerIds: string[] = [];
  try {
    const raw = (await db.setting.findUnique({ where: { key: "demoPlayerIds" } }))?.value;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) demoPlayerIds = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    // trasig lista = rör inga spelare
  }
  const season = await getActiveSeason();
  const latest = season
    ? await db.standingSnapshot.findFirst({ where: { seasonId: season.id }, orderBy: [{ round: "desc" }, { createdAt: "desc" }] })
    : null;
  await db.$transaction([
    // Demotippare (kaskad: tips, chatt, följningar). Adminkontot behålls men dess demotips tas bort.
    db.entry.deleteMany({ where: { user: demoUsers } }),
    db.chatMessage.deleteMany({ where: { user: demoUsers } }),
    db.user.deleteMany({ where: { ...demoUsers, id: { not: me.id }, role: { not: "ADMIN" } } }),
    db.oddsQuote.deleteMany({ where: { source: "SEED" } }),
    // Syntetisk tabellhistorik – senaste (riktiga) tabellen behålls
    db.standingSnapshot.deleteMany({ where: { source: "SEED", ...(latest ? { id: { not: latest.id } } : {}) } }),
    ...(latest ? [db.standingSnapshot.update({ where: { id: latest.id }, data: { source: "MANUAL" } })] : []),
    // Bara de påhittade spelarna som seed-skriptet skapade (och som ingen längre har tippat). Spelare från ESPN,
    // API-Football eller som Anders lagt in för hand rörs aldrig.
    db.player.deleteMany({ where: { id: { in: demoPlayerIds }, scorerTips: { none: {} }, assistTips: { none: {} } } }),
    db.setting.deleteMany({ where: { key: { in: ["demoData", "demoPlayerIds"] } } }),
  ]);
  return done("Demodata är borttagen. Aktuell tabell, Hall of Fame och historik finns kvar.", "/");
}
