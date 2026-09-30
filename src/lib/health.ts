/**
 * Övervakning av tabellsynken. Tidigare stod det bara "Senaste synk … misslyckades" på adminsidan, och bara den som
 * öppnade sidan märkte att tabellen frusit. Nu får admin en notis, och /api/health kan övervakas utifrån.
 */
import { db } from "./db";
import { sendNotification } from "./notify";
import { finishCheck } from "./finish";
import { syncStaleness } from "./sync-staleness";
import type { Season } from "./season";

export { syncStaleness, type Staleness } from "./sync-staleness";

const HOUR = 3_600_000;

export type SyncStatus = {
  /** Senaste LYCKADE synk */
  lastOkAt: Date | null;
  lastAttempt: { at: string; ok: boolean; provider: string | null; log: string[] } | null;
};

export async function getSyncStatus(): Promise<SyncStatus> {
  const [okRaw, attemptRaw] = await Promise.all([
    db.setting.findUnique({ where: { key: "lastSyncOkAt" } }),
    db.setting.findUnique({ where: { key: "lastSync" } }),
  ]);
  let lastAttempt: SyncStatus["lastAttempt"] = null;
  if (attemptRaw) {
    try {
      const v = attemptRaw.value.startsWith("{") ? JSON.parse(attemptRaw.value) : { at: attemptRaw.value, ok: true };
      lastAttempt = { at: v.at, ok: v.ok !== false, provider: v.provider ?? null, log: v.log ?? [] };
    } catch {
      lastAttempt = null;
    }
  }
  // Äldre installationer saknar lastSyncOkAt: räkna då senaste försöket som lyckat om det var det
  const okAt = okRaw?.value ?? (lastAttempt?.ok ? lastAttempt.at : null);
  return { lastOkAt: okAt && !Number.isNaN(Date.parse(okAt)) ? new Date(okAt) : null, lastAttempt };
}

const alertKey = (seasonId: string) => `staleAlert:${seasonId}`;

/** Skickar en notis till admin när tabellen blivit gammal (högst en per 12 timmar) och en när den kommit igång igen. */
export async function checkSyncHealth(season: Season, now = new Date()) {
  const status = await getSyncStatus();
  let s = syncStaleness(season, status.lastOkAt, now);
  // Är alla matcher spelade finns inget mer att hämta
  if (s.stale && (await finishCheck(season.id)).ready) s = { ...s, stale: false };
  const raw = (await db.setting.findUnique({ where: { key: alertKey(season.id) } }))?.value;
  const rec = raw ? (JSON.parse(raw) as { active: boolean; at: string }) : null;
  const write = (active: boolean) =>
    db.setting.upsert({
      where: { key: alertKey(season.id) },
      create: { key: alertKey(season.id), value: JSON.stringify({ active, at: now.toISOString() }) },
      update: { value: JSON.stringify({ active, at: now.toISOString() }) },
    });

  if (s.stale) {
    if (!rec?.active || now.getTime() - Date.parse(rec.at) > 12 * HOUR) {
      await sendNotification({
        type: "GENERAL",
        audience: "ADMIN",
        title: `Tabellen har inte kunnat hämtas på ${Math.round(s.ageMin / 60)} timmar`,
        body: `${status.lastAttempt?.log.slice(-2).join("\n") ?? "Ingen synk har lyckats."}\nTipstabellen visar senast kända tabell. Försök igen under Admin → Översikt, eller mata in tabellen manuellt under Admin → Tabell.`,
        link: "/admin",
        seasonId: season.id,
      });
      await write(true);
    }
  } else if (rec?.active) {
    await sendNotification({
      type: "GENERAL",
      audience: "ADMIN",
      title: "Tabellen uppdateras igen ✅",
      body: "Synken fungerar igen, inget mer att göra.",
      link: "/admin",
      seasonId: season.id,
    });
    await write(false);
  }
  return s;
}
