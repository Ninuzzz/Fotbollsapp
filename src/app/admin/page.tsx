import Link from "next/link";
import { db } from "@/lib/db";
import { computePrizes, getActiveSeason, getLatestSnapshot, seasonPhase } from "@/lib/season";
import { providerOrder } from "@/lib/football-api";
import { pushEnabled } from "@/lib/notify";
import { oddsApiEnabled } from "@/lib/odds";
import { Card, Stat, Badge } from "@/components/ui";
import { fmtDateTime, kr, relative } from "@/lib/format";
import { clearDemoData, runSync, sendDeadlineReminder } from "@/app/actions/admin";
import { ActionButton } from "./ui";

export default async function AdminHome() {
  const season = await getActiveSeason();
  if (!season) return <Card>Skapa en tävling under <Link href="/admin/tavlingar" className="text-gold underline">Tävlingar</Link>.</Card>;
  const [entries, users, snapshot, lastSyncRaw, demo, prizes] = await Promise.all([
    db.entry.findMany({ where: { seasonId: season.id } }),
    db.user.count(),
    getLatestSnapshot(season.id),
    db.setting.findUnique({ where: { key: "lastSync" } }),
    db.setting.findUnique({ where: { key: "demoData" } }),
    computePrizes(season.id),
  ]);
  const lastSync = lastSyncRaw ? (JSON.parse(lastSyncRaw.value.startsWith("{") ? lastSyncRaw.value : `{"at":"${lastSyncRaw.value}"}`) as { at: string; provider?: string }) : null;
  const confirmed = entries.filter((e) => e.paymentStatus === "CONFIRMED" || e.freeEntry).length;
  const claimed = entries.filter((e) => e.paymentStatus === "CLAIMED").length;
  const submitted = entries.filter((e) => e.submittedAt).length;
  const phase = seasonPhase(season);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-4xl">{season.name}</h2>
        <Badge tone={phase === "TIPPING" ? "gold" : phase === "RUNNING" ? "pitch" : "neutral"}>
          {phase === "TIPPING" ? "Tipsning pågår" : phase === "RUNNING" ? "Säsongen pågår" : "Avslutad"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Deltagare" value={entries.length} hint={`${users} konton totalt`} />
        <Stat label="Betalda" value={confirmed} hint={claimed ? `${claimed} väntar på bekräftelse` : "inga väntande"} tone="pitch" />
        <Stat label="Inlämnade tips" value={submitted} hint={`${entries.length - submitted} saknas`} tone="gold" />
        <Stat label="Prispott" value={kr(prizes.pool)} hint={`${kr(season.reservedAmount)} avsatt`} />
      </div>

      {claimed > 0 && (
        <Link href="/admin/deltagare?filter=claimed" className="block rounded-2xl border border-gold/40 bg-gold-dim/30 p-4 font-semibold hover:brightness-110">
          {claimed} deltagare har angett att de swishat. Bekräfta betalningarna →
        </Link>
      )}

      <Card>
        <h3 className="font-display text-3xl">Automatisk data</h3>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>
            Tabell, skytte- och assistliga: <strong className="text-text">{providerOrder().join(" → ")}</strong>
            {" "}(ESPN kräver ingen nyckel · API-Football används om FOOTBALL_PROVIDER=api-football och nyckel finns)
          </li>
          <li>Spelarfoton: TheSportsDB (exakt namnmatchning)</li>
          <li>
            Senaste tabell: omgång {snapshot?.round ?? "–"} ({snapshot ? `${snapshot.source === "API" ? "API" : snapshot.source === "MANUAL" ? "manuell" : "seed"}, ${relative(snapshot.createdAt)}` : "ingen"})
          </li>
          <li>Senaste synk: {lastSync ? `${fmtDateTime(lastSync.at)}${lastSync.provider ? ` via ${lastSync.provider}` : ""}` : "aldrig"}</li>
          <li>Push: {pushEnabled() ? "konfigurerat" : "VAPID-nycklar saknas (npm run vapid)"} · Odds-API: {oddsApiEnabled() ? "på" : "av (manuella odds)"}</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton action={runSync.bind(null, "standings")} variant="gold">Hämta tabell & ligor nu</ActionButton>
          <ActionButton action={runSync.bind(null, "photos")}>Leta spelarfoton</ActionButton>
          <ActionButton action={runSync.bind(null, "squads")}>Hämta trupper</ActionButton>
          <ActionButton action={runSync.bind(null, "test-af")}>Testa API-Football-nyckel</ActionButton>
        </div>
      </Card>

      <Card>
        <h3 className="font-display text-3xl">Snabbåtgärder</h3>
        <div className="mt-4 flex flex-wrap gap-3">
          {phase === "TIPPING" && (
            <ActionButton action={sendDeadlineReminder} confirm="Skicka påminnelse till alla som inte lämnat in tips?">
              Skicka deadline-påminnelse
            </ActionButton>
          )}
          <Link href="/admin/tabell" className="inline-flex min-h-11 items-center rounded-xl border border-border-strong px-5 font-semibold hover:border-pitch">
            Uppdatera tabell manuellt
          </Link>
          <Link href="/admin/utskick" className="inline-flex min-h-11 items-center rounded-xl border border-border-strong px-5 font-semibold hover:border-pitch">
            Skriv nyhet / push
          </Link>
        </div>
        <p className="mt-4 text-sm text-muted">
          Schemalagd synk: anropa <code className="rounded bg-bg px-1.5 py-0.5">POST /api/cron?job=sync</code> varje timme och{" "}
          <code className="rounded bg-bg px-1.5 py-0.5">?job=reminders</code> dagligen med <code>Authorization: Bearer CRON_SECRET</code>.
        </p>
      </Card>

      {demo?.value === "true" && (
        <Card className="border-danger/40">
          <h3 className="font-display text-3xl">Demoläge</h3>
          <p className="mt-2 text-sm text-muted">
            Sajten innehåller demotippare, chatt, exempelodds och syntetisk tabellhistorik. Ta bort dem innan riktiga deltagare anmäler sig. Aktuell tabell,
            lag, spelare som tippats, Hall of Fame och historik behålls.
          </p>
          <div className="mt-4">
            <ActionButton action={clearDemoData} variant="danger" confirm="Ta bort all demodata? Detta går inte att ångra.">
              Rensa demodata
            </ActionButton>
          </div>
        </Card>
      )}
    </div>
  );
}
