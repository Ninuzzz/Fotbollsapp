/**
 * Säsongsavslut: kontroll att serien verkligen är klar, fastställande (frysning) av slutresultatet och rättelser.
 *
 * Varför: prispengar betalas ut på slutresultatet. Tidigare räknades en omgång som klar när alla utom två lag spelat den,
 * och "Avsluta säsong" hade ingen spärr, så prislistan kunde skickas medan två lag hade en match kvar. Slutresultatet
 * sparades inte heller, utan räknades om vid varje sidvisning.
 */
import { createHash } from "node:crypto";
import { db } from "./db";
import { computePrizes, getLatestSnapshot } from "./season";
import { sendNotification } from "./notify";
import { createBackup } from "./backup";

export const FROZEN_MESSAGE = "Säsongen är avslutad och frusen. Öppna den igen under Tävlingar om något måste rättas.";

export type FinishCheck = {
  hasTable: boolean;
  totalRounds: number;
  /** Lag som ännu inte spelat alla omgångar */
  behind: { name: string; played: number }[];
  /** Alla lag har spelat alla omgångar */
  ready: boolean;
};

export async function finishCheck(seasonId: string): Promise<FinishCheck> {
  const season = await db.season.findUniqueOrThrow({ where: { id: seasonId } });
  const snap = await getLatestSnapshot(seasonId);
  if (!snap) return { hasTable: false, totalRounds: season.totalRounds, behind: [], ready: false };
  const behind = snap.rows.filter((r) => r.played < season.totalRounds).map((r) => ({ name: r.team.name, played: r.played }));
  return { hasTable: true, totalRounds: season.totalRounds, behind, ready: behind.length === 0 };
}

/** Inga namn i det som lagras: raderar en deltagare sitt konto ska inget identifierbart ligga kvar här. */
export type FinalResult = {
  at: string;
  pool: number;
  participants: number;
  /** Kronor som inte delas ut (avrundning nedåt vid delade placeringar) */
  unallocated: number;
  /** Fingeravtryck av vem som får hur mycket – används för att upptäcka en ändrad prislista vid omavslut */
  hash: string;
  ranking: { entryId: string; rank: number; errors: number; exact: number }[];
  payouts: { entryId: string; rank: number; amount: number; shared: number }[];
  losers: string[];
};

const resultKey = (seasonId: string) => `finalResult:${seasonId}`;
export const announcedKey = (seasonId: string) => `finishedAnnounced:${seasonId}`;

export function payoutsHash(payouts: { id: string; rank: number; amount: number }[]) {
  const norm = payouts.map((p) => [p.id, p.rank, p.amount]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256").update(JSON.stringify(norm)).digest("hex").slice(0, 16);
}

export async function buildFinalResult(seasonId: string) {
  const prizes = await computePrizes(seasonId);
  const result: FinalResult = {
    at: new Date().toISOString(),
    pool: prizes.pool,
    participants: prizes.participants,
    unallocated: prizes.unallocated,
    hash: payoutsHash(prizes.payouts),
    ranking: prizes.ranked.map((r) => ({ entryId: r.id, rank: r.rank, errors: r.errors, exact: r.exact })),
    payouts: prizes.payouts.map((p) => ({ entryId: p.id, rank: p.rank, amount: p.amount, shared: p.shared })),
    losers: prizes.losers,
  };
  return { result, prizes };
}

export async function getFinalResult(seasonId: string): Promise<FinalResult | null> {
  const raw = (await db.setting.findUnique({ where: { key: resultKey(seasonId) } }))?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FinalResult;
  } catch {
    return null;
  }
}

export const finalResultSetting = (seasonId: string, result: FinalResult) => ({
  where: { key: resultKey(seasonId) },
  create: { key: resultKey(seasonId), value: JSON.stringify(result) },
  update: { value: JSON.stringify(result) },
});

export async function clearFinalResult(seasonId: string) {
  await db.setting.deleteMany({ where: { key: resultKey(seasonId) } });
}

/** Hash från förra tillkännagivandet (äldre poster är bara en tidsstämpel och saknar hash). */
export async function announcedHash(seasonId: string): Promise<{ announced: boolean; hash: string | null }> {
  const raw = (await db.setting.findUnique({ where: { key: announcedKey(seasonId) } }))?.value;
  if (!raw) return { announced: false, hash: null };
  try {
    const v = JSON.parse(raw) as { hash?: string };
    return { announced: true, hash: v.hash ?? null };
  } catch {
    return { announced: true, hash: null };
  }
}

/** Är säsongen frusen (avslutad)? Ändringar som påverkar slutresultatet ska nekas. */
export async function seasonFrozen(seasonId: string | null | undefined) {
  if (!seasonId) return false;
  return Boolean((await db.season.findUnique({ where: { id: seasonId }, select: { isFinished: true } }))?.isFinished);
}

type Outcome = { ok: boolean; message?: string; error?: string };

/**
 * Avslutar säsongen:
 *  - kräver att ALLA lag har spelat alla omgångar (`force` åsidosätter, efter att admin kontrollerat slutställningen)
 *  - tar en backup, fastställer slutresultatet (sparas) och fryser säsongen
 *  - skickar prislistan till alla. Har den redan skickats och prislistan nu är en annan blir det en rättelse.
 */
export async function finalizeSeason(id: string, force = false): Promise<Outcome> {
  const season = await db.season.findUnique({ where: { id } });
  if (!season) return { ok: false, error: "Tävlingen finns inte." };
  if (season.isFinished) return { ok: true, message: "Säsongen är redan avslutad." };
  const check = await finishCheck(id);
  if (!check.hasTable) return { ok: false, error: "Det finns ingen tabell än, så säsongen kan inte avslutas." };
  if (!check.ready && !force)
    return {
      ok: false,
      error: `Inte alla lag har spelat klart (${check.totalRounds} matcher): ${check.behind.map((b) => `${b.name} ${b.played}`).join(", ")}. Vänta tills de sista matcherna är spelade. Har du kontrollerat slutställningen på allsvenskan.se kan du använda "Avsluta ändå".`,
    };

  // Fasta punkten: en kopia av allt precis innan resultatet fastställs
  await createBackup("avslut").catch(() => {});
  const { result, prizes } = await buildFinalResult(id);
  await db.$transaction([db.season.update({ where: { id }, data: { isFinished: true } }), db.setting.upsert(finalResultSetting(id, result))]);

  const before = await announcedHash(id);
  if (before.hash !== result.hash) {
    const nameOf = new Map(prizes.ranked.map((r) => [r.id, r.user.name]));
    const lines = prizes.payouts.map((p) => `${p.rank}:a ${nameOf.get(p.id) ?? "?"} – ${p.amount} kr${p.shared > 1 ? " (delad)" : ""}`);
    await sendNotification({
      type: "RESULTS",
      title: before.announced ? `${season.name}: rättat slutresultat` : `${season.name} är avgjort! 🏆`,
      body: `${before.announced ? "Slutresultatet har rättats. Det här gäller:\n" : ""}${lines.length ? lines.join("\n") : "Slutställningen är klar."}${prizes.unallocated > 0 ? `\nEj utdelat (avrundning): ${prizes.unallocated} kr` : ""}`,
      link: "/tipstabell",
      seasonId: id,
    });
    const value = JSON.stringify({ at: result.at, hash: result.hash });
    await db.setting.upsert({ where: { key: announcedKey(id) }, create: { key: announcedKey(id), value }, update: { value } });
  }
  return {
    ok: true,
    message: check.ready
      ? "Säsongen är avslutad, slutresultatet är fastställt och alla har fått veta vem som vann."
      : "Säsongen är avslutad trots att alla lag inte spelat klart. Slutresultatet är fastställt och skickat.",
  };
}

/** Öppnar en avslutad säsong igen så att något kan rättas. Slutresultatet fastställs på nytt vid nästa avslut. */
export async function reopenSeason(id: string): Promise<Outcome> {
  const season = await db.season.findUnique({ where: { id } });
  if (!season) return { ok: false, error: "Tävlingen finns inte." };
  if (!season.isFinished) return { ok: true, message: "Säsongen är redan öppen." };
  await createBackup("oppnad-igen").catch(() => {});
  await db.season.update({ where: { id }, data: { isFinished: false } });
  await clearFinalResult(id);
  return { ok: true, message: "Säsongen är öppnad igen. Tabell, spelare och betalningar kan ändras. Avsluta den igen när allt är rättat – ändras prislistan skickas en rättelse till alla." };
}
