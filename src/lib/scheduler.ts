/**
 * Inbyggd schemaläggare: en gång i timmen hämtas tabell, skytte-/assistliga och nyheter
 * från externa källor och sparas i vår egen databas. Användarna läser alltid från databasen,
 * så externa API:er anropas aldrig per sidvisning (inga rate limits).
 *
 * Stängs av med INTERNAL_SCHEDULER=false (t.ex. om du kör flera instanser och i stället
 * anropar /api/cron från en extern schemaläggare).
 */
const HOUR = 60 * 60 * 1000;

export async function runScheduledJobs(reason = "schemalagd") {
  const { getActiveSeason } = await import("./season");
  const { syncFromApi } = await import("./football-api");
  const { refreshNews } = await import("./news");
  const { remindMissing } = await import("./reminders");
  const season = await getActiveSeason();
  const log: string[] = [];
  if (season && !season.isFinished) {
    try {
      const r = await syncFromApi(season.id);
      log.push(`synk: ${r.log.at(-1) ?? "ok"}`);
    } catch (e) {
      log.push(`synk misslyckades: ${(e as Error).message}`);
    }
    try {
      log.push(`påminnelse: ${await remindMissing(season)}`);
    } catch (e) {
      log.push(`påminnelse misslyckades: ${(e as Error).message}`);
    }
  }
  try {
    log.push(`nyheter: ${(await refreshNews()).length} st`);
  } catch (e) {
    log.push(`nyheter misslyckades: ${(e as Error).message}`);
  }
  console.log(`[scheduler] ${reason}: ${log.join(" · ")}`);
  return log;
}

export function startScheduler() {
  const g = globalThis as unknown as { __tipsetScheduler?: boolean };
  if (g.__tipsetScheduler) return;
  g.__tipsetScheduler = true;
  setTimeout(() => void runScheduledJobs("vid start").catch(() => {}), 30_000).unref?.();
  setInterval(() => void runScheduledJobs().catch(() => {}), HOUR).unref?.();
  console.log("[scheduler] startad – kör varje timme");
}
