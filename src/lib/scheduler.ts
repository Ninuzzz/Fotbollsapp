/**
 * Inbyggd schemaläggare. Den tickar var 5:e minut och kör varje jobb när det är dags, så att tabellen hämtas tätt
 * när matcher spelas och glest annars. Tabell, skytte-/assistliga och nyheter hämtas från externa källor och sparas i
 * vår egen databas. Användarna läser alltid från databasen, så externa API:er anropas aldrig per sidvisning.
 *
 * Tabellsynk:  var 10:e minut fredag–söndag kl 12–24 (svensk tid), annars varje timme, var 3:e timme före seriestart.
 * Nattlig backup, trupper och foton en gång per dygn, nyheter varje timme, påminnelser före deadline.
 *
 * Stängs av med INTERNAL_SCHEDULER=false (t.ex. om du kör flera instanser och i stället anropar /api/cron från en
 * extern schemaläggare – kör då /api/cron?job=all var 10:e–30:e minut).
 */
import { isMatchWeekday, stockholmParts } from "./time";

const MIN = 60_000;
const HOUR = 60 * MIN;
const TICK = 5 * MIN;

/** Hur ofta tabellen ska hämtas just nu. */
export function syncIntervalMs(now: Date, season: { startDate: Date }): number {
  if (now.getTime() < season.startDate.getTime() - 12 * HOUR) return 3 * HOUR;
  if (isMatchWeekday(now) && stockholmParts(now).hour >= 12) return 10 * MIN;
  return HOUR;
}

/** `force` (start, extern cron) tvingar fram tabellsynken; övriga jobb följer alltid sina egna tidtabeller. */
export async function runScheduledJobs(reason = "schemalagd", { force = false } = {}) {
  const { db } = await import("./db");
  const { getActiveSeason, repairLeaderboards } = await import("./season");
  const { syncFromApi } = await import("./football-api");
  const { refreshNews } = await import("./news");
  const { remindMissing } = await import("./reminders");
  const { checkSyncHealth, getSyncStatus } = await import("./health");
  const now = new Date();
  const log: string[] = [];

  /** Har det gått `ms` sedan jobbet senast kördes? (30 s marginal så att tickens jitter inte hoppar över en körning) */
  const due = async (key: string, ms: number) => {
    const v = (await db.setting.findUnique({ where: { key } }))?.value;
    return !v || now.getTime() - Date.parse(v) >= ms - 30_000;
  };
  const ran = (key: string) =>
    db.setting.upsert({ where: { key }, create: { key, value: now.toISOString() }, update: { value: now.toISOString() } });

  const season = await getActiveSeason();
  if (season && !season.isFinished) {
    // Tabell, skytteliga, assistliga
    try {
      const last = (await getSyncStatus()).lastAttempt?.at;
      if (force || !last || now.getTime() - Date.parse(last) >= syncIntervalMs(now, season) - 30_000) {
        const r = await syncFromApi(season.id);
        log.push(`synk: ${r.log.at(-1) ?? "ok"}`);
      }
    } catch (e) {
      log.push(`synk misslyckades: ${(e as Error).message}`);
    }
    // Laga tabeller som saknar tipstabell (hål efter en gammal krasch) – billig fråga, gör oftast ingenting
    try {
      const fixed = await repairLeaderboards(season.id);
      if (fixed) log.push(`lagade tipstabell för ${fixed} tabell(er)`);
    } catch (e) {
      log.push(`reparation misslyckades: ${(e as Error).message}`);
    }
    // Larma admin om tabellen har blivit gammal
    try {
      await checkSyncHealth(season, now);
    } catch (e) {
      log.push(`hälsokontroll misslyckades: ${(e as Error).message}`);
    }
    // Trupper en gång per dygn: ger spelare att välja som skytt/assistkung redan före seriestart,
    // och tar med nyförvärv och nyuppflyttade lag under säsongen
    try {
      const key = `squadsAt:${season.id}`;
      if (await due(key, 23 * HOUR)) {
        const { syncSquads } = await import("./football-api");
        const { applyPlayerPhotos } = await import("./player-photo-archive");
        const sq = await syncSquads(season.id);
        const ph = await applyPlayerPhotos(db);
        await ran(key);
        log.push(`trupper: ${sq.players} spelare i ${sq.teams} lag, ${ph.applied} foton från arkivet`);
      }
    } catch (e) {
      log.push(`trupper misslyckades: ${(e as Error).message}`);
    }
    // Spelarfoton från API-Football en gång per dygn (16 anrop av gratisplanens 100)
    try {
      if (process.env.API_FOOTBALL_KEY && (await due("afPhotosAt", 23 * HOUR))) {
        const { syncPhotosFromApiFootball } = await import("./football-api");
        log.push((await syncPhotosFromApiFootball(season.id)).log[0]!);
      }
    } catch (e) {
      log.push(`foton misslyckades: ${(e as Error).message}`);
    }
    try {
      const r = await remindMissing(season);
      if (r.startsWith("Påminnelse skickad")) log.push(`påminnelse: ${r}`);
    } catch (e) {
      log.push(`påminnelse misslyckades: ${(e as Error).message}`);
    }
  }

  // Backup: nattligen (efter 03 svensk tid, eller om ett dygn missats) och runt deadline – före och efter att tipsen låses
  try {
    const { createBackup } = await import("./backup");
    const { hour } = stockholmParts(now);
    const jobs: [string, number, boolean, string][] = [["backupAt:natt", 20 * HOUR, hour >= 3 && hour < 6, "natt"]];
    // Efter varje omstart/deploy: en färsk kopia av vad som ligger på disken (högst en per timme mot krascher i loop)
    if (reason === "vid start") jobs.push(["backupAt:start", HOUR, true, "start"]);
    if (season && !season.isFinished) {
      const toDeadline = season.editDeadline.getTime() - now.getTime();
      if (toDeadline > 0 && toDeadline <= 3 * HOUR) jobs.push([`backupAt:deadline-fore:${season.id}`, 365 * 24 * HOUR, true, "deadline-fore"]);
      if (toDeadline <= 0 && toDeadline > -3 * HOUR) jobs.push([`backupAt:deadline-efter:${season.id}`, 365 * 24 * HOUR, true, "deadline-efter"]);
    }
    for (const [key, every, inWindow, reason] of jobs) {
      const missed = reason === "natt" && (await due(key, 30 * HOUR));
      if ((inWindow && (await due(key, every))) || missed) {
        const b = await createBackup(reason);
        await ran(key);
        log.push(`backup (${reason}): ${(b.bytes / 1024).toFixed(0)} kB`);
      }
    }
  } catch (e) {
    log.push(`backup misslyckades: ${(e as Error).message}`);
  }

  try {
    if (await due("newsAt", HOUR)) {
      log.push(`nyheter: ${(await refreshNews()).length} st`);
      await ran("newsAt");
    }
  } catch (e) {
    log.push(`nyheter misslyckades: ${(e as Error).message}`);
  }
  if (log.length) console.log(`[scheduler] ${reason}: ${log.join(" · ")}`);
  return log;
}

export function startScheduler() {
  const g = globalThis as unknown as { __tipsetScheduler?: boolean };
  if (g.__tipsetScheduler) return;
  g.__tipsetScheduler = true;
  setTimeout(
    () =>
      void (async () => {
        const { migrateSnapshotRounds } = await import("./season");
        const n = await migrateSnapshotRounds().catch((e) => `misslyckades: ${(e as Error).message}`);
        if (n) console.log(`[scheduler] omräknade omgångsnummer: ${n}`);
        await runScheduledJobs("vid start", { force: true });
      })().catch(() => {}),
    30_000,
  ).unref?.();
  setInterval(() => void runScheduledJobs().catch(() => {}), TICK).unref?.();
  console.log("[scheduler] startad – tickar var 5:e minut");
}
