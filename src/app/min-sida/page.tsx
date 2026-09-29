import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Goal, Handshake, PenLine, Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computePrizes, getActiveSeason, getLatestSnapshot, rankHistory, seasonPhase } from "@/lib/season";
import { Badge, ButtonLink, Card, SectionTitle } from "@/components/ui";
import { TeamCrest } from "@/components/team-crest";
import { Avatar } from "@/components/avatar";
import { RankMove } from "@/components/rank-move";
import { RankChart } from "@/components/rank-chart-lazy";
import { PlayerFace } from "@/components/player-face";
import { Reveal } from "@/components/motion";
import { Countdown } from "@/components/countdown";
import { fmtDateTime, kr } from "@/lib/format";

export const metadata = { title: "Min sida" };
export const dynamic = "force-dynamic";

export default async function MyPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) return null;
  const phase = seasonPhase(season);
  const team = user.favoriteTeam;
  // Alla frågor är oberoende av varandra – kör dem parallellt i stället för efter varandra
  const [entry, prizes, history, snapshot, star, players, assistLeader] = await Promise.all([
    db.entry.findUnique({
      where: { userId_seasonId: { userId: user.id, seasonId: season.id } },
      include: { rows: true, topScorer: { include: { team: true } }, topAssist: { include: { team: true } } },
    }),
    computePrizes(season.id),
    rankHistory(season.id),
    getLatestSnapshot(season.id),
    // Stjärnspelare: admins val, annars lagets bästa målskytt i år
    team
      ? team.starPlayer
        ? Promise.resolve({ name: team.starPlayer, photoUrl: team.starPlayerPhoto, goals: null as number | null, assists: null as number | null })
        : db.player.findFirst({ where: { seasonId: season.id, teamId: team.id }, orderBy: [{ goals: "desc" }, { assists: "desc" }] })
      : Promise.resolve(null),
    db.player.findMany({ where: { seasonId: season.id }, orderBy: { goals: "desc" }, take: 1 }),
    db.player.findFirst({ where: { seasonId: season.id }, orderBy: { assists: "desc" } }),
  ]);
  const { ranked } = prizes;
  const me = ranked.find((r) => r.user.id === user.id);
  const payout = me ? prizes.payouts.find((p) => p.id === me.id) : undefined;
  const isLast = me ? prizes.losers.includes(me.id) : false;

  const tipMap = new Map(entry?.rows.map((r) => [r.teamId, r.position]) ?? []);
  const chartData = history.map((h) => ({ round: h.round, [me?.id ?? "x"]: me ? h.ranks[me.id] ?? null : null }));
  const paid = entry?.paymentStatus === "CONFIRMED" || entry?.freeEntry;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      {/* PERSONLIG HERO */}
      <section className="card relative overflow-hidden p-6 md:p-10" style={{ background: `linear-gradient(135deg, color-mix(in oklab, var(--team) 30%, var(--surface)) 0%, var(--surface) 60%)` }}>
        {team && (
          <div className="pointer-events-none absolute -right-16 -top-16 opacity-[0.12] md:-right-8" aria-hidden>
            <TeamCrest team={team} size={360} />
          </div>
        )}
        <div className="relative grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="flex items-center gap-5">
            <Avatar value={user.avatar} name={user.name} size={88} className="ring-4 ring-team" />
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest text-muted">{season.name}</p>
              <h1 className="font-display text-5xl md:text-7xl">{user.name}</h1>
              {team && (
                <p className="mt-1 flex items-center gap-2 text-muted">
                  <TeamCrest team={team} size={20} /> {team.name}
                </p>
              )}
            </div>
          </div>
          {star && team && (
            <div className="flex items-center gap-4 rounded-2xl border border-border-strong bg-bg/60 p-4 backdrop-blur">
              {star.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={star.photoUrl} alt={star.name} className="size-16 rounded-full object-cover ring-2 ring-team" />
              ) : (
                <div className="grid size-16 place-items-center rounded-full bg-team text-team-2">
                  <Star className="size-7" />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gold">Lagets stjärna</p>
                <p className="font-display text-3xl">{star.name}</p>
                {star.goals !== null && (
                  <p className="text-sm text-muted">
                    {star.goals} mål · {star.assists} assist
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* BETALNING / STATUS */}
      {entry && !paid && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold-dim/30 p-4 sm:flex-row sm:items-center">
          <Clock className="size-6 shrink-0 text-gold" />
          <div className="flex-1">
            <p className="font-semibold">
              {entry.paymentStatus === "CLAIMED" ? "Betalningen väntar på bekräftelse" : "Du har inte betalat än"}
            </p>
            <p className="text-sm text-muted">
              Swisha {season.entryFee} kr till {season.swishNumber}. När Anders har bekräftat betalningen blir du aktiv och får tillgång till chatten.
            </p>
          </div>
          <ButtonLink href="/profil#betalning" variant="outline" className="shrink-0">
            Betalningsinfo
          </ButtonLink>
        </div>
      )}

      {!entry?.submittedAt && phase === "TIPPING" && (
        <div className="mt-6 card flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
          <AlertCircle className="size-8 text-gold" />
          <div className="flex-1">
            <p className="font-display text-3xl">Du har inte lämnat in ditt tips än</p>
            <p className="text-muted">Sista chansen: {fmtDateTime(season.editDeadline)}</p>
            <div className="mt-3">
              <Countdown to={season.editDeadline.toISOString()} />
            </div>
          </div>
          <ButtonLink href="/tipsa" variant="gold">
            <PenLine className="size-4" /> Tippa nu
          </ButtonLink>
        </div>
      )}

      {me && snapshot && (
        <>
          {/* NYCKELTAL – ett kort med avdelare i stället för fyra separata lådor */}
          <Reveal>
            <section className="card mt-8 grid grid-cols-2 lg:grid-cols-4 [&>div]:border-border/70 [&>div]:p-5 md:[&>div]:p-6">
              <div className="border-b border-r lg:border-b-0">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Placering</p>
                <p className="font-display mt-2 flex items-baseline gap-3 text-5xl text-gold md:text-6xl">
                  {me.rank}
                  <span className="text-2xl">
                    <RankMove previous={me.previousRank} current={me.rank} />
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted">av {ranked.length} tippare</p>
              </div>
              <div className="border-b lg:border-b-0 lg:border-r">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Antal fel</p>
                <p className="font-display mt-2 text-5xl text-danger md:text-6xl">{me.errors}</p>
                <p className="mt-1 text-sm text-muted">ledaren har {ranked[0]?.errors ?? 0}</p>
              </div>
              <div className="border-r">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Exakt rätt</p>
                <p className="font-display mt-2 text-5xl text-pitch md:text-6xl">{me.exact}</p>
                <p className="mt-1 text-sm text-muted">lag på rätt plats</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Om det slutade nu</p>
                <p className="font-display mt-2 text-5xl md:text-6xl">{payout ? kr(payout.amount) : isLast ? "Gratis" : "–"}</p>
                <p className="mt-1 text-sm text-muted">
                  {payout ? (payout.shared > 1 ? `delad ${payout.rank}:a plats` : `${payout.rank}:a plats`) : isLast ? "nästa år (sistaplatsen)" : "utanför prisplats"}
                </p>
              </div>
            </section>
          </Reveal>

          {/* UTSLAGSFRÅGOR – ett kort, två rader */}
          <Reveal>
            <section className="card mt-4 divide-y divide-border/70" aria-label="Utslagsfrågor">
              {[
                { icon: Goal, label: "Din skytteligavinnare", p: entry?.topScorer, v: me.scorerGoals, gap: me.scorerGap, unit: "mål", leader: players[0] },
                { icon: Handshake, label: "Din assistkung", p: entry?.topAssist, v: me.assistCount, gap: me.assistGap, unit: "assist", leader: assistLeader },
              ].map((t) => (
                <div key={t.label} className="flex items-center gap-4 p-4 md:px-6">
                  {t.p ? (
                    <PlayerFace name={t.p.name} photoUrl={t.p.photoUrl} team={t.p.team} size={48} />
                  ) : (
                    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-surface-3">
                      <t.icon className="size-6 text-gold" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t.label}</p>
                    <p className="truncate text-lg font-semibold">
                      {t.p?.name ?? "Ej vald"}
                      {t.p && <span className="ml-2 text-sm font-normal text-muted">{t.p.team.shortName}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-4xl text-gold">{t.v ?? "–"}</p>
                    <p className="text-xs text-muted">
                      {t.gap === 0 ? "leder ligan" : t.gap !== null ? `${t.gap} ${t.unit} efter ${t.leader?.name ?? "ledaren"}` : t.unit}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          </Reveal>

          {/* PER LAG */}
          <section className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div>
              <SectionTitle>Ditt tips mot verkligheten</SectionTitle>
              <p className="-mt-2 mb-4 text-sm text-muted">Fel per lag just nu. ↑ = laget ligger bättre till än du tippat.</p>
              <div className="relative overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-3 py-3 text-left">Nu</th>
                      <th className="px-2 py-3 text-left">Lag</th>
                      <th className="px-2 py-3 text-right">Tippad</th>
                      <th className="px-3 py-3 text-left">Fel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.rows.map((r) => {
                      const tip = tipMap.get(r.teamId);
                      const diff = tip !== undefined ? Math.abs(tip - r.position) : null;
                      const better = tip !== undefined && r.position < tip;
                      return (
                        <tr key={r.teamId} className="border-t border-border/70 odd:bg-surface/40">
                          <td className="px-3 py-2.5 font-display text-xl text-muted">{r.position}</td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <TeamCrest team={r.team} size={22} />
                              <span className="font-semibold">{r.team.name}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-muted">{tip ?? "–"}</td>
                          <td className="px-3 py-2.5">
                            {diff === 0 ? (
                              <Badge tone="pitch">
                                <CheckCircle2 className="size-3.5" /> Exakt
                              </Badge>
                            ) : diff !== null ? (
                              <span
                                className={`inline-flex items-center gap-1 font-bold tabular-nums ${diff <= 2 ? "text-gold" : "text-danger"}`}
                                title={better ? "Laget ligger bättre till än du tippat" : "Laget ligger sämre till än du tippat"}
                              >
                                {diff}
                                <span className="font-normal text-muted" aria-label={better ? "bättre än tippat" : "sämre än tippat"}>
                                  {better ? "↑" : "↓"}
                                </span>
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border-strong bg-surface-2">
                      <td colSpan={3} className="px-3 py-3 text-right font-semibold">
                        Totalt
                      </td>
                      <td className="px-3 py-3 font-display text-2xl text-danger">{me.errors} fel</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div>
              <SectionTitle action={<Link href="/tipstabell#trender" className="text-sm font-semibold text-gold hover:underline">Jämför</Link>}>
                Din resa
              </SectionTitle>
              <Card className="p-3 md:p-4">
                <RankChart data={chartData} series={[{ id: me.id, name: "Din placering", highlight: true }]} maxRank={ranked.length} height={300} />
              </Card>
              <ButtonLink href="/tipstabell" variant="outline" className="mt-4 w-full">
                Hela tipstabellen <ArrowRight className="size-4" />
              </ButtonLink>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
