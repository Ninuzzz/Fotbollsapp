/**
 * Säsongsbytet: skapa nästa års tävling och byt de lag som åkt upp/ner. Används av säsongsguiden i admin.
 * Rena databasfunktioner (ingen inloggningskontroll här – admin-actions anropar dem efter admin()).
 */
import { db } from "./db";
import { fromLocalDeadline, fromLocalInput, toLocalInput } from "./format";
import { getLatestSnapshot, getSeasonTeams } from "./season";
import { matchTeam } from "./teams-data";
import type { EspnLeagueTeam } from "./espn";

/** Samma väggklocka i Stockholm ett år senare ("2026-04-03T23:59" → "2027-04-03T23:59"). 29 feb → 28 feb. */
export function plusOneYear(d: Date): string {
  const local = toLocalInput(d);
  const y = Number(local.slice(0, 4)) + 1;
  let rest = local.slice(4);
  if (rest.startsWith("-02-29")) rest = "-02-28" + rest.slice(6);
  return `${y}${rest}`;
}

/** Nästa års namn: byter årtalet i namnet, annars läggs det nya året till. */
export function nextName(name: string, year: number) {
  return name.includes(String(year)) ? name.replace(String(year), String(year + 1)) : `${name} ${year + 1}`;
}

export type NextSeasonResult = { ok: true; seasonId: string; name: string; activated: boolean } | { ok: false; error: string };

/**
 * Skapar nästa års tävling från den avslutade: datum ett år fram, samma avgift, Swish, pott-regler och lag.
 * Blir aktiv direkt (förra året är ju avslutat). Rör aldrig den gamla tävlingen.
 */
export async function createNextSeason(prevId: string): Promise<NextSeasonResult> {
  const prev = await db.season.findUnique({ where: { id: prevId } });
  if (!prev) return { ok: false, error: "Tävlingen finns inte." };
  if (!prev.isFinished) return { ok: false, error: `Avsluta ${prev.name} först – annars skulle två tävlingar pågå samtidigt.` };
  const year = prev.year + 1;
  if (await db.season.findUnique({ where: { year } })) return { ok: false, error: `Det finns redan en tävling för ${year}. Se Admin → Tävlingar.` };

  const season = await db.$transaction(async (tx) => {
    const s = await tx.season.create({
      data: {
        name: nextName(prev.name, prev.year),
        year,
        startDate: fromLocalInput(plusOneYear(prev.startDate)),
        registrationDeadline: fromLocalDeadline(plusOneYear(prev.registrationDeadline).slice(0, 16)),
        editDeadline: fromLocalDeadline(plusOneYear(prev.editDeadline).slice(0, 16)),
        entryFee: prev.entryFee,
        swishNumber: prev.swishNumber,
        reservedAmount: prev.reservedAmount,
        prizeSplit: prev.prizeSplit,
        totalRounds: prev.totalRounds,
        apiLeagueId: prev.apiLeagueId,
      },
    });
    const teams = await tx.seasonTeam.findMany({ where: { seasonId: prev.id } });
    await tx.seasonTeam.createMany({ data: teams.map((t) => ({ seasonId: s.id, teamId: t.teamId })) });
    await tx.season.updateMany({ data: { isActive: false } });
    await tx.season.update({ where: { id: s.id }, data: { isActive: true } });
    return s;
  });
  return { ok: true, seasonId: season.id, name: season.name, activated: true };
}

/** Förra årets slutplacering för de sämsta lagen: åker ur (15–16) och kval (14). */
export async function tableBottom(seasonId: string) {
  const snap = await getLatestSnapshot(seasonId);
  if (!snap || snap.rows.length < 16) return null;
  const at = (p: number) => snap.rows.find((r) => r.position === p)?.team;
  return { relegated: [at(15), at(16)].filter(Boolean).map((t) => t!.name), playoff: at(14)?.name ?? null };
}

export type TeamCheck =
  | { status: "ok" }
  | { status: "diff"; out: { id: string; name: string }[]; in: EspnLeagueTeam[] }
  | { status: "stale" } // ESPN visar ännu förra årets lag
  | { status: "unknown"; reason: string };

/**
 * Jämför tävlingens lag med ESPN:s laglista. `previousTeamIds` = förra årets lag: är ESPN:s lista exakt samma lag
 * har ESPN inte bytt säsong än, och då föreslås inget.
 */
export async function teamCheck(seasonId: string, espn: EspnLeagueTeam[] | null, previousTeamIds: string[] = []): Promise<TeamCheck> {
  if (!espn) return { status: "unknown", reason: "ESPN:s laglista gick inte att hämta just nu." };
  if (espn.length !== 16) return { status: "unknown", reason: `ESPN:s laglista har ${espn.length} lag.` };
  const ours = await getSeasonTeams(seasonId);
  const all = await db.team.findMany();
  const idOf = (e: EspnLeagueTeam) => all.find((t) => t.espnId === e.espnId)?.id ?? matchTeam(e.name, all)?.id ?? null;
  const espnIds = espn.map(idOf);
  const out = ours.filter((t) => !espnIds.includes(t.id)).map((t) => ({ id: t.id, name: t.name }));
  const inTeams = espn.filter((e, i) => !ours.some((t) => t.id === espnIds[i]));
  if (!out.length && !inTeams.length) {
    // Samma lag som förra året och ESPN håller med: ESPN har inte bytt säsong än (i Allsvenskan åker alltid två lag ur)
    const unchanged = previousTeamIds.length > 0 && ours.every((t) => previousTeamIds.includes(t.id));
    return unchanged ? { status: "stale" } : { status: "ok" };
  }
  return { status: "diff", out, in: inTeams };
}

/**
 * Byter lag i en tävling: tar bort `outIds` och lägger till ESPN-lagen (från lagbanken om de finns där, annars nya lag
 * med ESPN:s namn, förkortning, färger och logotyp). Vägrar om någon redan tippat med ett lag som tas bort.
 */
export async function swapTeams(seasonId: string, outIds: string[], add: EspnLeagueTeam[]) {
  const ours = await getSeasonTeams(seasonId);
  if (ours.length - outIds.length + add.length !== 16) return { ok: false as const, error: "Efter bytet ska tävlingen ha exakt 16 lag." };
  const used = await db.tipRow.count({ where: { teamId: { in: outIds }, entry: { seasonId } } });
  if (used) return { ok: false as const, error: `${used} tips innehåller redan ett lag som skulle tas bort. Byt lag under Admin → Lag i stället, och be de tipparna att tippa om.` };

  const all = await db.team.findMany();
  const added: string[] = [];
  await db.$transaction(async (tx) => {
    await tx.seasonTeam.deleteMany({ where: { seasonId, teamId: { in: outIds } } });
    for (const e of add) {
      const existing = all.find((t) => t.espnId === e.espnId) ?? matchTeam(e.name, all);
      const team =
        existing ??
        (await tx.team.create({
          data: {
            name: e.name,
            shortName: e.shortName,
            aliases: "",
            primaryColor: e.color && /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : "#1e3a8a",
            secondaryColor: e.altColor && /^#[0-9a-f]{6}$/i.test(e.altColor) ? e.altColor : "#ffffff",
            logoUrl: e.logo,
            espnId: e.espnId,
          },
        }));
      if (existing && (!existing.espnId || !existing.logoUrl))
        await tx.team.update({ where: { id: existing.id }, data: { espnId: existing.espnId ?? e.espnId, logoUrl: existing.logoUrl ?? e.logo } });
      await tx.seasonTeam.upsert({
        where: { seasonId_teamId: { seasonId, teamId: team.id } },
        create: { seasonId, teamId: team.id },
        update: {},
      });
      added.push(team.name);
    }
  });
  return { ok: true as const, added, removed: ours.filter((t) => outIds.includes(t.id)).map((t) => t.name) };
}
