/**
 * Go-live-kontroll: allt som ska vara på plats innan (och under) en säsong, som en lista med grönt/gult/rött.
 * Visas på Admin → Översikt så att inget beror på att någon minns en checklista.
 */
import { db } from "./db";
import { pushEnabled } from "./notify";
import { demoUserCount } from "./demo-data";
import { getSyncStatus, syncStaleness } from "./health";
import { getSeasonTeams, seasonPhase, type Season } from "./season";

export type Check = { id: string; state: "ok" | "warn" | "fail"; label: string; hint?: string };

const HOUR = 3_600_000;

export async function goLiveChecks(season: Season, now = new Date()): Promise<Check[]> {
  const [teams, players, admins, demoUsers, demoFlag, backupRaw, sync] = await Promise.all([
    getSeasonTeams(season.id),
    db.player.count({ where: { seasonId: season.id } }),
    db.user.count({ where: { role: "ADMIN" } }),
    demoUserCount(db),
    db.setting.findUnique({ where: { key: "demoData" } }),
    db.setting.findUnique({ where: { key: "lastBackup" } }),
    getSyncStatus(),
  ]);
  const checks: Check[] = [];
  const add = (id: string, ok: boolean, label: string, hint?: string, bad: "warn" | "fail" = "warn") => checks.push({ id, state: ok ? "ok" : bad, label, hint });

  const demoOn = demoFlag?.value === "true" || demoUsers > 0;
  add("demo", !demoOn, demoOn ? "Demoläget är på" : "Demoläget är av", "Rensa demodatan innan riktiga deltagare anmäler sig (Översikt → Demoläge).");

  add("teams", teams.length === 16, teams.length === 16 ? "16 lag i tävlingen" : `${teams.length} lag i tävlingen – ska vara 16`, "Rätta under Admin → Lag.", "fail");
  add("players", players >= 30, `${players} spelare att välja som skytt/assistkung`, "Tryck Hämta trupper på Översikt.", "fail");

  const deadlineOk = season.editDeadline <= season.startDate;
  add("deadline", deadlineOk, deadlineOk ? "Deadline ligger före seriestart" : "Deadline ligger efter seriestart", "Rätta datumen under Admin → Tävlingar.", "fail");

  add("admins", admins >= 2, admins >= 2 ? `${admins} administratörer` : "Bara en administratör", "Utse en till under Admin → Deltagare, så att inget hänger på ett enda konto och lösenord.");

  const cronOk = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET !== "byt-mig" && process.env.CRON_SECRET.length >= 16);
  add("cron", cronOk, cronOk ? "CRON_SECRET är satt" : "CRON_SECRET saknas eller är för kort", "Behövs för extern cron och off-site-backup (fly secrets set CRON_SECRET=<lång slumpsträng>).");

  add("push", pushEnabled(), pushEnabled() ? "Pushnotiser är konfigurerade" : "Pushnotiser saknar VAPID-nycklar", "Kör npm run vapid och lägg nycklarna i fly.toml/secrets.");

  const backup = backupRaw ? (JSON.parse(backupRaw.value) as { at: string; bytes: number; reason: string }) : null;
  const fresh = backup && now.getTime() - Date.parse(backup.at) < 26 * HOUR;
  add(
    "backup",
    Boolean(fresh),
    backup ? `Senaste backup: ${new Date(backup.at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })} (${backup.reason})` : "Ingen backup har tagits än",
    "Backup tas nattligen och runt deadline. Tryck Ta backup nu för att testa.",
  );

  const offsite = Boolean(process.env.BACKUP_PASSPHRASE && process.env.BACKUP_PASSPHRASE.length >= 16 && cronOk);
  add(
    "offsite",
    offsite,
    offsite ? "Krypterad off-site-backup är möjlig" : "Off-site-backup är inte aktiverad",
    "Sätt BACKUP_PASSPHRASE (minst 16 tecken) och CRON_SECRET och schemalägg hämtningen (docs/DRIFT.md). Backuper på samma disk skyddar inte mot att disken försvinner.",
  );

  const s = syncStaleness(season, sync.lastOkAt, now);
  add(
    "sync",
    !s.stale,
    !s.watching
      ? "Tabellsynk: bevakas från seriestart"
      : sync.lastOkAt
        ? `Senaste lyckade tabellsynk: ${new Date(sync.lastOkAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })}`
        : "Ingen lyckad tabellsynk än",
    "Försök igen under Översikt eller mata in tabellen manuellt (Admin → Tabell).",
  );

  const reserve = Boolean(process.env.API_FOOTBALL_KEY);
  add("reserve", reserve, reserve ? "Reservkälla för tabellen: API-Football" : "Bara ESPN som källa", "Manuell inmatning är reserv. En API-Football-nyckel ger en andra automatisk källa (testa med knappen på Översikt).");

  const proxy = Boolean(process.env.TRUSTED_IP_HEADER || process.env.FLY_APP_NAME);
  add("proxy", proxy, proxy ? "IP-huvud för inloggningsspärren är satt" : "TRUSTED_IP_HEADER saknas", "Behövs bakom en proxy så att inloggningsspärren inte slår mot alla eller går att kringgå.");

  const seedPw = process.env.NODE_ENV === "production" && Boolean(process.env.SEED_ADMIN_PASSWORD);
  add("seedpw", !seedPw, seedPw ? "Startlösenordet SEED_ADMIN_PASSWORD ligger kvar" : "Startlösenordet är borttaget", "Kör: fly secrets unset SEED_ADMIN_PASSWORD");

  if (seasonPhase(season, now) === "TIPPING") {
    const paidNoTip = await db.entry.count({ where: { seasonId: season.id, OR: [{ paymentStatus: "CONFIRMED" }, { freeEntry: true }], submittedAt: null } });
    add("incomplete", paidNoTip === 0, paidNoTip ? `${paidNoTip} betalande har inte lämnat in ett komplett tips` : "Alla betalande har lämnat in komplett tips", "Skicka påminnelse. Efter deadline går tipset inte att komplettera.");
  }
  return checks;
}
