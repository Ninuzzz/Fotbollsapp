import Link from "next/link";
import { ArrowRight, Coffee, Crown, Gift, ListOrdered, Smartphone, Target, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computePrizes, getActiveSeason, getLeaderboard, latestAwards, seasonPhase } from "@/lib/season";
import { ButtonLink, Badge } from "@/components/ui";
import { CountUp, Parallax, Reveal, RollingBall, Stagger, Ball } from "@/components/motion";
import { LeagueTable } from "@/components/league-table";
import { Avatar } from "@/components/avatar";
import { TeamCrest } from "@/components/team-crest";
import { RankMove } from "@/components/rank-move";
import { AwardCards } from "@/components/awards";
import { Countdown } from "@/components/countdown";
import { fmtDate, kr } from "@/lib/format";
import { parseSplit } from "@/lib/prizes";
import { publicUser } from "@/lib/privacy";
import { isMember } from "@/lib/chat-access";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ raderat?: string }> }) {
  const { raderat } = await searchParams;
  const [user, season] = await Promise.all([getCurrentUser(), getActiveSeason()]);
  if (!season) return <div className="p-10">Ingen säsong skapad ännu. Logga in som admin.</div>;
  const [{ ranked: rankedRaw, snapshot }, awardsRaw, prizes, heroes] = await Promise.all([
    getLeaderboard(season.id),
    latestAwards(season.id),
    computePrizes(season.id),
    // GDPR: bara vinnare som gett samtycke visas publikt
    db.hallOfFame.findMany({ where: { consent: true }, orderBy: { year: "desc" } }),
  ]);
  const loggedIn = await isMember(user);
  const ranked = rankedRaw.map((r) => ({ ...r, user: publicUser(r.user, loggedIn) }));
  const awards = awardsRaw.map((a) => ({ ...a, user: a.user ? publicUser(a.user, loggedIn) : null }));
  const phase = seasonPhase(season);
  const me = user ? ranked.find((r) => r.user.id === user.id) : undefined;
  const split = parseSplit(season.prizeSplit);
  const round = snapshot?.round ?? 0;

  return (
    <>
      {raderat && (
        <p role="status" className="mx-auto mt-4 max-w-7xl rounded-2xl border border-pitch/40 bg-pitch-dim/40 px-4 py-3 text-sm md:px-6">
          Ditt konto och all din data är raderad. Tack för att du var med!
        </p>
      )}
      {/* HERO */}
      <section className="relative isolate overflow-hidden">
        <Parallax speed={0.35} className="pitch-lines absolute inset-0 -z-10">
          <div />
        </Parallax>
        <div className="absolute left-1/2 top-24 -z-10 size-[38rem] -translate-x-1/2 rounded-full border border-pitch/15 md:size-[52rem]" aria-hidden />
        <div className="absolute left-1/2 top-0 -z-10 h-full w-px bg-pitch/10" aria-hidden />
        <div className="mx-auto grid grid-cols-1 max-w-7xl items-center gap-10 px-4 pb-16 pt-12 md:px-6 md:pb-28 md:pt-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div>
            <Reveal intro>
              <Badge tone="gold" className="mb-5">
                <Trophy className="size-3.5" /> {season.name} · säsong {season.year - 2014}
              </Badge>
            </Reveal>
            <Reveal intro delay={0.05}>
              <h1 className="font-display text-[clamp(4rem,13vw,10rem)]">
                Allsvenskan
                <br />
                <span className="shimmer">tipset</span>
              </h1>
            </Reveal>
            <Reveal intro delay={0.12}>
              <p className="mt-5 max-w-xl text-lg text-muted md:text-xl">
                Tippa sluttabellen, 1 till 16. Minst antal fel vinner pengarna, muggen och ett år av ovärderlig rätt att skryta.
              </p>
            </Reveal>
            <Reveal intro delay={0.18}>
              <div className="mt-8 flex flex-wrap gap-3">
                {user ? (
                  <>
                    <ButtonLink href="/min-sida" variant="gold">
                      Till min sida <ArrowRight className="size-4" />
                    </ButtonLink>
                    <ButtonLink href="/tipstabell" variant="outline">
                      Se tipstabellen
                    </ButtonLink>
                  </>
                ) : (
                  <>
                    <ButtonLink href="/registrera" variant="gold">
                      Gå med för {season.entryFee} kr <ArrowRight className="size-4" />
                    </ButtonLink>
                    <ButtonLink href="/tipstabell" variant="outline">
                      Kika på tipstabellen
                    </ButtonLink>
                  </>
                )}
              </div>
            </Reveal>
            {phase === "TIPPING" && (
              <Reveal intro delay={0.24}>
                <div className="mt-8">
                  <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted">Sista dag att tippa: {fmtDate(season.editDeadline)}</p>
                  <Countdown to={season.editDeadline.toISOString()} />
                </div>
              </Reveal>
            )}
          </div>

          {/* Personligt kort eller topp 3 */}
          <Reveal intro delay={0.2} y={40}>
            <div className="relative">
              <div className="absolute -right-4 -top-10 hidden animate-[float-y_5s_ease-in-out_infinite] md:block" aria-hidden>
                <Ball size={84} />
              </div>
              {me && user ? (
                <div className="card glow-gold relative overflow-hidden p-6 md:p-8">
                  {user.favoriteTeam && (
                    <div className="absolute -right-10 -top-10 opacity-20" aria-hidden>
                      <TeamCrest team={user.favoriteTeam} size={200} />
                    </div>
                  )}
                  <p className="text-sm font-semibold uppercase tracking-widest text-muted">Hej {user.name.split(" ")[0]}!</p>
                  <div className="mt-4 flex items-end gap-4">
                    <p className="font-display text-8xl text-gradient-gold md:text-9xl">{me.rank}</p>
                    <div className="pb-3">
                      <p className="font-display text-3xl">plats</p>
                      <p className="text-muted">av {ranked.length} tippare</p>
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-bg/50 p-3">
                      <p className="font-display text-4xl text-danger">{me.errors}</p>
                      <p className="text-xs text-muted">fel</p>
                    </div>
                    <div className="rounded-xl bg-bg/50 p-3">
                      <p className="font-display text-4xl text-pitch">{me.exact}</p>
                      <p className="text-xs text-muted">exakt rätt</p>
                    </div>
                    <div className="rounded-xl bg-bg/50 p-3">
                      <p className="font-display text-4xl">
                        <RankMove previous={me.previousRank} current={me.rank} />
                      </p>
                      <p className="text-xs text-muted">senaste</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card relative p-6 md:p-8">
                  <p className="text-sm font-semibold uppercase tracking-widest text-muted">
                    Toppen just nu · omgång {round}
                  </p>
                  <ol className="mt-5 space-y-3">
                    {ranked.slice(0, 3).map((r, i) => (
                      <li key={r.id} className="flex items-center gap-4 rounded-xl bg-bg/50 p-3">
                        <span className={`font-display w-8 text-center text-4xl ${i === 0 ? "text-gold" : "text-muted"}`}>{r.rank}</span>
                        <Avatar value={r.user.avatar} name={r.user.name} size={44} />
                        <span className="flex-1 font-semibold">{r.user.name}</span>
                        <span className="font-display text-3xl text-danger">{r.errors}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* SIFFROR */}
      <section className="border-y border-border/60 bg-surface/50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4 md:px-6">
          {[
            { v: ranked.length, l: "tippare i år" },
            { v: prizes.pool, l: "kr i prispotten", suffix: "" },
            { v: round, l: `av ${season.totalRounds} omgångar spelade` },
            { v: season.year - 2014, l: "säsonger sedan 2015" },
          ].map((s, i) => (
            <Reveal key={s.l} delay={i * 0.08}>
              <p className="font-display text-6xl text-gold md:text-7xl">
                <CountUp to={s.v} />
              </p>
              <p className="text-sm text-muted">{s.l}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* SÅ FUNKAR DET */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Så funkar det</p>
          <h2 className="font-display mt-2 text-5xl md:text-7xl">Tre steg till muggen</h2>
        </Reveal>
        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { icon: Smartphone, t: "Gå med & swisha", d: `Skapa konto, välj favoritlag och avatar. Swisha ${season.entryFee} kr till ${season.swishNumber}.` },
            { icon: ListOrdered, t: "Tippa tabellen", d: "Placera alla 16 lag, 1 till 16. Välj skytteligavinnare och assistkung. De avgör vid lika poäng!" },
            { icon: Target, t: "Minst fel vinner", d: "Tippar du MFF 1:a och de blir 3:a blir det 2 fel. Felen för alla lag summeras. Bara slutresultatet räknas." },
          ].map((s, i) => (
            <Reveal key={s.t} delay={i * 0.1}>
              <div className="card group h-full p-7 transition duration-300 hover:-translate-y-1 hover:border-pitch/50">
                <div className="flex items-center justify-between">
                  <s.icon className="size-9 text-pitch transition group-hover:scale-110" />
                  <span className="font-display text-7xl text-surface-3">{i + 1}</span>
                </div>
                <h3 className="font-display mt-6 text-3xl">{s.t}</h3>
                <p className="mt-2 text-muted">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* LIVE TIPSTABELL + UTMÄRKELSER */}
      <section className="grass relative overflow-hidden py-20 md:py-28">
        <RollingBall className="absolute right-6 top-8 md:right-16" />
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Live · omgång {round}</p>
            <h2 className="font-display mt-2 text-5xl md:text-7xl">Tipstabellen</h2>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <div className="card p-3 md:p-4">
              <Stagger className="divide-y divide-border/60">
                {ranked.slice(0, 8).map((r) => (
                  <div key={r.id} className={`flex items-center gap-3 px-2 py-3 ${r.user.id === user?.id ? "rounded-xl bg-team/10" : ""}`}>
                    <span className="font-display w-8 text-center text-3xl text-muted">{r.rank}</span>
                    <span className="w-8">
                      <RankMove previous={r.previousRank} current={r.rank} />
                    </span>
                    <Avatar value={r.user.avatar} name={r.user.name} size={36} />
                    <span className="flex-1 truncate font-semibold">{r.user.name}</span>
                    <span className="hidden text-sm text-muted sm:inline">{r.exact} exakta</span>
                    <span className="font-display w-12 text-right text-3xl text-danger">{r.errors}</span>
                  </div>
                ))}
              </Stagger>
              <Link href="/tipstabell" className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-gold hover:bg-surface-3">
                Hela tipstabellen, grafer och jämförelser <ArrowRight className="size-4" />
              </Link>
            </div>
            <div>
              <Reveal>
                <h3 className="font-display mb-4 text-3xl">Veckans utmärkelser</h3>
              </Reveal>
              <Reveal delay={0.1}>
                <AwardCards awards={awards} />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ALLSVENSKAN LIVE */}
      {snapshot && (
        <section className="mx-auto max-w-7xl px-4 py-20 md:px-6 md:py-28">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Reveal>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Verkligheten</p>
              <h2 className="font-display mt-2 text-5xl md:text-7xl">Allsvenskan just nu</h2>
              <p className="mt-4 max-w-md text-muted">
                Tabellen hämtas automatiskt efter varje omgång. {round} omgångar är spelade. Allt kan fortfarande hända: de sista {season.totalRounds - round} omgångarna avgör.
              </p>
              <ButtonLink href="/allsvenskan" variant="outline" className="mt-6">
                Skytteliga & assistliga <ArrowRight className="size-4" />
              </ButtonLink>
            </Reveal>
            <Reveal delay={0.1}>
              <LeagueTable rows={snapshot.rows} compact highlightTeamId={user?.favoriteTeamId} />
            </Reveal>
          </div>
        </section>
      )}

      {/* PRISPOTTEN */}
      <section className="border-y border-border/60 bg-surface/40 py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Prispotten</p>
            <h2 className="font-display mt-2 text-5xl md:text-7xl">
              <CountUp to={prizes.pool} suffix=" kr" /> att spela om
            </h2>
            <p className="mt-3 max-w-2xl text-muted">
              {prizes.participants} betalande × {season.entryFee} kr minus {kr(season.reservedAmount)} som avsätts till mugg, vandringspris och tröstpris.
            </p>
          </Reveal>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {split.map((pct, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <div className={`card h-full p-6 ${i === 0 ? "glow-gold" : ""}`}>
                  <p className="font-display text-6xl text-gradient-gold">{i + 1}:a</p>
                  <p className="mt-3 text-2xl font-bold">{kr(Math.floor((prizes.pool * pct) / 100))}</p>
                  <p className="text-sm text-muted">{pct} % av potten</p>
                  {i === 0 && (
                    <p className="mt-3 flex items-center gap-2 text-sm text-gold">
                      <Coffee className="size-4" /> + mugg & namn på vandringspriset
                    </p>
                  )}
                </div>
              </Reveal>
            ))}
            <Reveal delay={0.3}>
              <div className="card h-full p-6">
                <Gift className="size-10 text-pitch" />
                <p className="font-display mt-3 text-3xl">Sistaplatsen</p>
                <p className="text-sm text-muted">Gratis medverkan nästa år. Ingen ska behöva gå hem tomhänt.</p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* HEROES */}
      {heroes.length > 0 && (
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <Reveal>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Hall of Fame</p>
                <h2 className="font-display mt-2 text-5xl md:text-7xl">Heroes</h2>
              </div>
              <ButtonLink href="/heroes" variant="outline" className="shrink-0">
                <Crown className="size-4" /> Alla mästare
              </ButtonLink>
            </div>
          </Reveal>
        </div>
        <div className="no-scrollbar mt-10 flex snap-x snap-mandatory gap-5 relative overflow-x-auto px-4 pb-4 md:px-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]">
          {heroes.map((h, i) => (
            <Reveal key={h.id} delay={Math.min(i * 0.06, 0.5)} className="shrink-0 snap-start">
              <Link href="/heroes" className="group block w-56 md:w-64">
                <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-border">
                  {h.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.imageUrl} alt={`${h.name}, vinnare ${h.year}`} loading="lazy" className="size-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid size-full place-items-center bg-surface-2"><Trophy className="size-16 text-gold" /></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-5xl text-gold">{h.year}</p>
                    <p className="font-semibold">{h.name}</p>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      )}

      {/* CTA */}
      {!user && (
        <section className="mx-auto max-w-4xl px-4 pb-24 pt-20 text-center md:px-6 md:pt-28">
          <Reveal>
            <h2 className="font-display text-6xl md:text-8xl">
              Är du nästa <span className="text-gradient-gold">hero</span>?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted">Det tar två minuter att gå med. Muggen väntar.</p>
            <ButtonLink href="/registrera" variant="gold" className="mt-8">
              Gå med nu <ArrowRight className="size-4" />
            </ButtonLink>
          </Reveal>
        </section>
      )}
    </>
  );
}
