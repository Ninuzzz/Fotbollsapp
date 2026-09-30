import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDot, Clock } from "lucide-react";
import { db } from "@/lib/db";
import { completedRound, computePrizes, getActiveSeason, getLatestSnapshot, getSeasonTeams, seasonPhase } from "@/lib/season";
import { getPendingStandings } from "@/lib/quarantine";
import { goLiveChecks } from "@/lib/golive";
import { getSyncStatus } from "@/lib/health";
import { providerOrder } from "@/lib/football-api";
import { pushEnabled } from "@/lib/notify";
import { oddsApiEnabled } from "@/lib/odds";
import { demoUserCount, realParticipantCount } from "@/lib/demo-data";
import { registrationOpen } from "@/lib/demo";
import { Card, Stat, Badge } from "@/components/ui";
import { fmtDateTime, kr, relative } from "@/lib/format";
import { approvePendingStandings, clearDemoData, loadDemoData, rejectPendingStandings, runBackup, runSync, sendDeadlineReminder } from "@/app/actions/admin";
import { ActionButton } from "./ui";

type Step = { state: "done" | "now" | "todo" | "warn"; text: React.ReactNode };

export default async function AdminHome() {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return <Card>Skapa en tävling under <Link href="/admin/tavlingar" className="text-gold underline">Tävlingar</Link>.</Card>;
  const [entries, users, snapshot, lastSyncRaw, demoFlag, prizes, teams, playerCount, real, demoUsers, regOpen, pending, checks, syncStatus, incomplete] = await Promise.all([
    db.entry.findMany({ where: { seasonId: season.id } }),
    db.user.count(),
    getLatestSnapshot(season.id),
    db.setting.findUnique({ where: { key: "lastSync" } }),
    db.setting.findUnique({ where: { key: "demoData" } }),
    computePrizes(season.id),
    getSeasonTeams(season.id),
    db.player.count({ where: { seasonId: season.id } }),
    realParticipantCount(db, season.id),
    demoUserCount(db),
    registrationOpen(season),
    getPendingStandings(season.id),
    goLiveChecks(season),
    getSyncStatus(),
    db.entry.findMany({
      where: { seasonId: season.id, submittedAt: null, OR: [{ paymentStatus: "CONFIRMED" }, { freeEntry: true }] },
      include: { user: { select: { name: true } }, rows: { select: { position: true } } },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);
  const lastSync = lastSyncRaw
    ? (JSON.parse(lastSyncRaw.value.startsWith("{") ? lastSyncRaw.value : `{"at":"${lastSyncRaw.value}"}`) as { at: string; provider?: string; ok?: boolean; log?: string[] })
    : null;
  const confirmed = entries.filter((e) => e.paymentStatus === "CONFIRMED" || e.freeEntry).length;
  const claimed = entries.filter((e) => e.paymentStatus === "CLAIMED").length;
  const submitted = entries.filter((e) => e.submittedAt).length;
  const phase = seasonPhase(season);
  const round = snapshot ? completedRound(snapshot.rows) : 0;
  const demoOn = demoFlag?.value === "true" || demoUsers > 0;
  // Alla lag har spelat alla omgångar (en "färdigspelad omgång" räcker inte: två lag kan ha en match kvar)
  const allPlayed = Boolean(snapshot?.rows.length) && snapshot!.rows.every((r) => r.played >= season.totalRounds);
  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const notOk = checks.filter((c) => c.state !== "ok");

  // Vad händer nu? Ett steg i taget, i den ordning säsongen går
  const steps: Step[] = [
    {
      state: teams.length === 16 ? "done" : "warn",
      text: teams.length === 16 ? `16 lag i tävlingen` : <>Tävlingen har {teams.length} lag – ska vara 16. Rätta under <Link className="underline" href="/admin/lag">Lag</Link>.</>,
    },
    {
      state: playerCount >= 30 ? "done" : "warn",
      text:
        playerCount >= 30 ? (
          `${playerCount} spelare att välja som skytteligavinnare och assistkung`
        ) : (
          <>Bara {playerCount} spelare finns – tipparna behöver kunna välja skytt och assistkung. Tryck <b>Hämta trupper</b> nedan (sker annars automatiskt en gång per dygn).</>
        ),
    },
    {
      state: phase === "TIPPING" ? (regOpen ? "now" : "todo") : "done",
      text:
        phase === "TIPPING" ? (
          <>
            Anmälan och tippning pågår. Sista anmälningsdag {fmtDateTime(season.registrationDeadline)}, sista tippdag {fmtDateTime(season.editDeadline)}.
            Påminnelser går automatiskt ut 7, 3 och 1 dag innan.
          </>
        ) : (
          `Tippningen stängde ${fmtDateTime(season.editDeadline)} – alla tips är låsta och synliga`
        ),
    },
    {
      state: claimed ? "now" : confirmed ? "done" : "todo",
      text: claimed ? <><b>{claimed}</b> väntar på att du bekräftar Swish-betalningen (<Link className="underline" href="/admin/deltagare?filter=claimed">Deltagare</Link>).</> : `${confirmed} bekräftade deltagare`,
    },
    {
      state: phase === "FINISHED" || allPlayed ? "done" : round > 0 ? "now" : "todo",
      text:
        round > 0
          ? `Omgång ${round} av ${season.totalRounds} är spelad. Tabellen hämtas automatiskt varje timme och alla får en notis per färdigspelad omgång.`
          : "Väntar på första omgången. Tabellen dyker upp automatiskt när första matcherna är spelade.",
    },
    {
      state: phase === "FINISHED" ? "done" : allPlayed ? "now" : "todo",
      text:
        phase === "FINISHED" ? (
          <>Säsongen är avslutad. Arkivera resultaten, lägg in vinnaren under <Link className="underline" href="/admin/heroes">Heroes</Link> och skapa nästa års tävling.</>
        ) : (
          <>När sista omgången är spelad: tryck <b>Avsluta säsong</b> under <Link className="underline" href="/admin/tavlingar">Tävlingar</Link> – då får alla veta vem som vann.</>
        ),
    },
  ];
  const icon = { done: CheckCircle2, now: CircleDot, todo: Clock, warn: AlertTriangle };
  const tone = { done: "text-pitch", now: "text-gold", todo: "text-muted", warn: "text-danger" };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-4xl">{season.name}</h2>
        <Badge tone={phase === "TIPPING" ? "gold" : phase === "RUNNING" ? "pitch" : "neutral"}>
          {phase === "TIPPING" ? "Tipsning pågår" : phase === "RUNNING" ? "Säsongen pågår" : "Avslutad"}
        </Badge>
        {demoOn && <Badge tone="danger">Demoläge</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Deltagare" value={entries.length} hint={`${users} konton totalt`} />
        <Stat label="Betalda" value={confirmed} hint={claimed ? `${claimed} väntar på bekräftelse` : "inga väntande"} tone="pitch" />
        <Stat label="Inlämnade tips" value={submitted} hint={`${entries.length - submitted} saknas`} tone="gold" />
        <Stat label="Prispott" value={kr(prizes.pool)} hint={`${prizes.participants} betalande · ${kr(season.reservedAmount)} avsatt${prizes.unallocated > 0 ? ` · ${kr(prizes.unallocated)} ej utdelat` : ""}`} />
      </div>

      {demoOn && real > 0 && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-danger/50 bg-danger-dim/40 p-4 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-danger" />
          <p>
            <b>Demodata är på och {real} riktiga deltagare (utöver administratörer) har anmält sig.</b> Demotipparna räknas redan bort ur tabell
            och prispott när någon av dem är bekräftad, men syns fortfarande i chatten. Rensa demodatan längst ner.
          </p>
        </div>
      )}

      {pending && (
        <Card className="border-danger/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 size-6 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-3xl">Tabell från {pending.provider ?? "API:et"} väntar på ditt godkännande</h3>
              <p className="mt-1 text-sm text-muted">
                Tabellen klarade inte kontrollerna och har inte publicerats. Den gamla tabellen ligger kvar. Hämtades {relative(pending.at)}.
              </p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {pending.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="bg-surface-2 text-xs uppercase text-muted">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">Lag</th>
                      <th className="px-2 py-1.5">MP</th>
                      <th className="px-2 py-1.5">V-O-F</th>
                      <th className="px-2 py-1.5">Mål</th>
                      <th className="px-2 py-1.5">P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...pending.rows].sort((a, b) => a.position - b.position).map((r) => (
                      <tr key={r.teamId} className="border-t border-border/70 text-center tabular-nums">
                        <td className="px-2 py-1 text-left text-muted">{r.position}</td>
                        <td className="px-2 py-1 text-left font-semibold">{teamName.get(r.teamId) ?? r.teamId}</td>
                        <td className="px-2 py-1">{r.played}</td>
                        <td className="px-2 py-1">{r.won}-{r.drawn}-{r.lost}</td>
                        <td className="px-2 py-1">{r.goalsFor}-{r.goalsAgainst}</td>
                        <td className="px-2 py-1">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <ActionButton action={approvePendingStandings} variant="gold" confirm="Publicera tabellen trots varningarna? Tipstabellen räknas om och en notis kan skickas till alla.">
                  Godkänn och publicera
                </ActionButton>
                <ActionButton action={rejectPendingStandings} variant="danger">Avvisa</ActionButton>
              </div>
            </div>
          </div>
        </Card>
      )}

      {phase === "TIPPING" && incomplete.length > 0 && (
        <Card className="border-gold/50">
          <h3 className="font-display text-3xl">{incomplete.length} betalande har inte lämnat in ett komplett tips</h3>
          <p className="mt-1 text-sm text-muted">
            Ett tips räknas först när alla 16 lag är placerade och både skytt och assistkung är valda. Ofullständiga tips syns inte i tipstabellen och kan
            inte kompletteras efter deadline ({fmtDateTime(season.editDeadline)}), men de betalade ändå in sin insats. Skicka en påminnelse.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {incomplete.map((e) => (
              <li key={e.id} className="rounded-full bg-surface-3 px-3 py-1">
                {e.user.name} <span className="text-muted">({e.rows.length}/16 lag)</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className={notOk.some((c) => c.state === "fail") ? "border-danger/40" : ""}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-3xl">Go-live-kontroll</h3>
          <Badge tone={notOk.length === 0 ? "pitch" : notOk.some((c) => c.state === "fail") ? "danger" : "gold"}>
            {notOk.length === 0 ? "Allt klart" : `${notOk.length} att åtgärda`}
          </Badge>
        </div>
        <ul className="mt-4 space-y-2.5">
          {[...checks].sort((a, b) => Number(a.state === "ok") - Number(b.state === "ok")).map((c) => {
            const I = c.state === "ok" ? CheckCircle2 : AlertTriangle;
            return (
              <li key={c.id} className="flex gap-3 text-sm">
                <I className={`mt-0.5 size-5 shrink-0 ${c.state === "ok" ? "text-pitch" : c.state === "fail" ? "text-danger" : "text-gold"}`} aria-label={c.state === "ok" ? "Klart" : "Behöver åtgärd"} />
                <span className={c.state === "ok" ? "text-muted" : ""}>
                  {c.label}
                  {c.state !== "ok" && c.hint ? <span className="block text-xs text-muted">{c.hint}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h3 className="font-display text-3xl">Säsongsstatus – vad händer nu</h3>
        <ol className="mt-4 space-y-3">
          {steps.map((s, i) => {
            const I = icon[s.state];
            return (
              <li key={i} className="flex gap-3 text-sm">
                <I className={`mt-0.5 size-5 shrink-0 ${tone[s.state]}`} aria-label={{ done: "Klart", now: "Pågår", todo: "Senare", warn: "Behöver åtgärd" }[s.state]} />
                <span className={s.state === "todo" ? "text-muted" : ""}>{s.text}</span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Card>
        <h3 className="font-display text-3xl">Automatisk data</h3>
        <p className="mt-2 text-sm text-muted">Allt hämtas av sig självt – var 10:e minut fredag–söndag kl 12–24, annars varje timme. Inga inställningar eller schemalagda jobb behövs.</p>
        <ul className="mt-3 space-y-1.5 text-sm text-muted">
          <li>
            Tabell, skytte- och assistliga: <strong className="text-text">{providerOrder().join(" → ")}</strong> (ESPN kräver ingen nyckel)
          </li>
          <li>Backup: nattligen och runt deadline (kontrollerade kopior på disken, se Go-live-kontrollen ovan). Trupper och spelarfoton: en gång per dygn (ESPN, sparade foton i projektet, API-Football om nyckel finns, TheSportsDB)</li>
          <li>
            Senaste tabell: {snapshot ? `omgång ${round} (${snapshot.source === "API" ? "automatisk" : snapshot.source === "MANUAL" ? "manuell" : "demo"}, ${relative(snapshot.createdAt)})` : "ingen än"}
          </li>
          <li className={lastSync && lastSync.ok === false ? "text-danger" : ""}>
            Senaste synk: {lastSync ? `${fmtDateTime(lastSync.at)}${lastSync.provider ? ` via ${lastSync.provider}` : ""}${lastSync.ok === false ? " – misslyckades" : ""}` : "aldrig"}
            {lastSync?.log?.length ? <span className="block text-xs">{lastSync.log.join(" · ")}</span> : null}
          </li>
          <li>Senaste lyckade synk: {syncStatus.lastOkAt ? `${fmtDateTime(syncStatus.lastOkAt)} (${relative(syncStatus.lastOkAt)})` : "aldrig"}</li>
          <li>Push: {pushEnabled() ? "konfigurerat" : "VAPID-nycklar saknas (npm run vapid)"} · Odds-API: {oddsApiEnabled() ? "på" : "av (manuella odds)"}</li>
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <ActionButton action={runSync.bind(null, "standings")} variant="gold">Hämta tabell & ligor nu</ActionButton>
          <ActionButton action={runSync.bind(null, "squads")}>Hämta trupper</ActionButton>
          <ActionButton action={runSync.bind(null, "photos")}>Leta spelarfoton</ActionButton>
          <ActionButton action={runSync.bind(null, "test-af")}>Testa API-Football-nyckel</ActionButton>
          <ActionButton action={runBackup}>Ta backup nu</ActionButton>
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
      </Card>

      <Card className={demoOn ? "border-danger/40" : ""}>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-display text-3xl">Demoläge</h3>
          <Badge tone={demoOn ? "danger" : "neutral"}>{demoOn ? `På · ${demoUsers} demotippare` : "Av"}</Badge>
        </div>
        {demoOn ? (
          <>
            <p className="mt-2 text-sm text-muted">
              Sajten visar påhittade tippare, tips, chatt, exempelodds och tabellhistorik så att den går att visa upp. Rensa innan riktiga deltagare anmäler sig.
              Riktiga konton, tips, tabell, Hall of Fame och historik rörs aldrig.
            </p>
            <div className="mt-4">
              <ActionButton action={clearDemoData} variant="danger" confirm="Ta bort all demodata? Riktiga konton och tips påverkas inte.">
                Rensa demodata
              </ActionButton>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Fyll sajten med 22 påhittade tippare, tips, chatt och tabellhistorik – bra för att visa hur det fungerar. Går att rensa igen med ett klick.
              Går att slå på så länge bara administratörer har anmält sig till tävlingen (deras egna deltaganden rörs aldrig).
            </p>
            {real > 0 ? (
              <p className="mt-3 flex gap-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  Går inte att slå på: {real} riktiga deltagare (utöver administratörer) finns redan i {season.name}. Påhittade tips blandas aldrig med riktiga. Visa i stället{" "}
                  <Link href="/simulering" className="font-semibold text-gold underline">
                    simuleringen
                  </Link>
                  .
                </span>
              </p>
            ) : (
              <div className="mt-4">
                <ActionButton action={loadDemoData} confirm="Läs in demodata? Inget befintligt raderas eller ändras, och du kan rensa den igen.">
                  Läs in demodata
                </ActionButton>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
