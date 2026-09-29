import { Award, Crown, Medal, TrendingDown, Trophy, Users } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isMember } from "@/lib/chat-access";
import { PageHeader, SectionTitle, Stat } from "@/components/ui";
import { Reveal } from "@/components/motion";
import { RankChart } from "@/components/rank-chart-lazy";

export const metadata = { title: "Heroes – Hall of Fame" };

/** Excel-filen särskiljer ibland namn med en extra bokstav ("UlfR Carlsson") */
const heroName = (n: string) => n.replace(/^(\p{Lu}\p{Ll}+)\p{Lu} /u, "$1 ");
export const dynamic = "force-dynamic";

export default async function HeroesPage() {
  const viewer = await getCurrentUser();
  // Historiken med namn är för bekräftade deltagare, inte för vem som helst med ett konto
  const loggedIn = await isMember(viewer);
  const isAdmin = viewer?.role === "ADMIN";
  const [allHeroes, allHistory] = await Promise.all([
    db.hallOfFame.findMany({ orderBy: { year: "desc" } }),
    // Historik med namn (all-time, kapplöpning) visas bara för inloggade deltagare
    loggedIn ? db.historicalResult.findMany({ orderBy: [{ year: "desc" }, { rank: "asc" }] }) : Promise.resolve([]),
  ]);
  const history = allHistory;

  // GDPR: namn och bild visas bara om vinnaren har gett samtycke (admin ser allt, markerat)
  const heroes = allHeroes.map((h) =>
    h.consent || isAdmin
      ? { ...h, hidden: !h.consent }
      : { ...h, name: "Vinnare " + h.year, imageUrl: null, description: "Namn och bild visas när vinnaren har gett sitt samtycke.", hidden: true },
  );

  // Titlar per person (endast samtyckta namn räknas med namn)
  const titles = new Map<string, number[]>();
  for (const h of allHeroes.filter((x) => x.consent || isAdmin)) titles.set(h.name, [...(titles.get(h.name) ?? []), h.year]);

  // All-time: summerat över alla avslutade år med sparade resultat
  type Agg = { name: string; seasons: number; total: number; best: number; medals: number };
  const agg = new Map<string, Agg>();
  for (const r of history) {
    const a = agg.get(r.name) ?? { name: r.name, seasons: 0, total: 0, best: 99, medals: 0 };
    a.seasons++;
    a.total += r.errors;
    a.best = Math.min(a.best, r.rank);
    if (r.rank <= 3) a.medals++;
    agg.set(r.name, a);
  }
  const allTime = [...agg.values()].sort((a, b) => a.total / a.seasons - b.total / b.seasons);
  const years = [...new Set(history.map((h) => h.year))].sort((a, b) => b - a);
  const record = history.reduce<(typeof history)[number] | null>((m, r) => (r.rank === 1 && (!m || r.errors < m.errors) ? r : m), null);

  // Kapplöpningen senaste importerade år (topp 5)
  const raceYear = years[0];
  const race = history.filter((h) => h.year === raceYear).slice(0, 5);
  const rounds = race.length ? (JSON.parse(race[0].rankHistory) as (number | null)[]).length : 0;
  const raceData = Array.from({ length: rounds }, (_, i) => {
    const row: Record<string, number | null> = { round: i + 1 };
    for (const r of race) row[r.id] = (JSON.parse(r.rankHistory) as (number | null)[])[i] ?? null;
    return row;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker="Hall of Fame" title="Heroes">
        Tipsets mästare genom åren. Alla har fått mugg, namn på vandringspriset och ett år av odödlig ära.
      </PageHeader>

      {/* Statistikdashboard */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Reveal><Stat label="Säsonger" value={heroes.length} hint="med en mästare" tone="gold" /></Reveal>
        <Reveal delay={0.05}>
          <Stat
            label="Flest titlar"
            value={titles.size ? Math.max(...[...titles.values()].map((v) => v.length)) : "–"}
            hint={
              titles.size
                ? [...titles.entries()].filter(([, v]) => v.length === Math.max(...[...titles.values()].map((x) => x.length))).map(([n]) => n).join(", ")
                : "Visas när vinnarna gett samtycke"
            }
          />
        </Reveal>
        <Reveal delay={0.1}><Stat label="Rekord (minst fel)" value={record?.errors ?? "–"} hint={record ? `${heroName(record.name)}, ${record.year}` : loggedIn ? "Importera historik" : "Logga in för att se"} tone="pitch" /></Reveal>
        <Reveal delay={0.15}><Stat label="Tippare i historiken" value={loggedIn ? agg.size : "–"} hint={years.length ? `data från ${years.join(", ")}` : loggedIn ? undefined : "Logga in för att se"} /></Reveal>
      </section>

      {/* Mästarväggen */}
      <section className="mt-14">
        <SectionTitle>
          <span className="flex items-center gap-2"><Crown className="size-7 text-gold" /> Mästarväggen</span>
        </SectionTitle>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {heroes.map((h, i) => (
            <Reveal key={h.id} delay={Math.min(i * 0.05, 0.4)}>
              <article className="group relative overflow-hidden rounded-2xl border border-border">
                <div className="aspect-[3/4]">
                  {h.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.imageUrl} alt={`${h.name} med vandringspriset ${h.year}`} loading="lazy" className="size-full object-cover transition duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="grid size-full place-items-center bg-surface-2"><Trophy className="size-16 text-gold" /></div>
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-4">
                  <p className="font-display text-6xl text-gradient-gold">{h.year}</p>
                  <h3 className="font-display text-2xl md:text-3xl">{h.name}</h3>
                  {isAdmin && h.hidden && (
                    <p className="mt-1 inline-flex rounded-full bg-danger/25 px-2 py-0.5 text-xs font-bold text-danger">Samtycke saknas – dolt för andra</p>
                  )}
                  {(titles.get(h.name)?.length ?? 0) > 1 && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold">
                      <Award className="size-3" /> {titles.get(h.name)!.length}× mästare
                    </p>
                  )}
                  {h.description && <p className="mt-2 line-clamp-3 text-sm text-white/80">{h.description}</p>}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {!loggedIn && (
        <p className="mt-10 text-muted">
          <a href="/logga-in" className="font-semibold text-gold underline">Logga in</a> för att se all-time-tabellen och kapplöpningen med alla
          tippares resultat.
        </p>
      )}

      {/* Kapplöpning */}
      {raceData.length > 0 && (
        <section className="mt-16">
          <SectionTitle>
            <span className="flex items-center gap-2"><TrendingDown className="size-7 text-gold" /> Kapplöpningen {raceYear}</span>
          </SectionTitle>
          <p className="-mt-2 mb-4 text-muted">Topp 5 och deras placering omgång för omgång.</p>
          <div className="card p-3 md:p-5">
            <RankChart data={raceData} series={race.map((r, i) => ({ id: r.id, name: r.name, highlight: i === 0 }))} height={360} />
          </div>
        </section>
      )}

      {/* All-time */}
      {allTime.length > 0 && (
        <section className="mt-16">
          <SectionTitle>
            <span className="flex items-center gap-2"><Users className="size-7 text-gold" /> All-time-tabellen</span>
          </SectionTitle>
          <p className="-mt-2 mb-4 text-muted">
            Total Score = summan av alla fel över åren. Sorterat på snitt per säsong, så att alla jämförs rättvist oavsett antal år.
          </p>
          <div className="relative overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-3 text-left">#</th>
                  <th className="px-2 py-3 text-left">Tippare</th>
                  <th className="px-2 py-3 text-right">Säsonger</th>
                  <th className="px-2 py-3 text-right">Total Score</th>
                  <th className="px-2 py-3 text-right">Snitt</th>
                  <th className="px-2 py-3 text-right">Bästa</th>
                  <th className="px-3 py-3 text-right">Titlar</th>
                </tr>
              </thead>
              <tbody>
                {allTime.map((a, i) => (
                  <tr key={a.name} className="border-t border-border/70 odd:bg-surface/40">
                    <td className="px-3 py-2.5 font-display text-xl text-muted">{i + 1}</td>
                    <td className="px-2 py-2.5 font-semibold">{heroName(a.name)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{a.seasons}</td>
                    <td className="px-2 py-2.5 text-right font-bold tabular-nums text-danger">{a.total}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{(a.total / a.seasons).toFixed(1)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {a.best <= 3 ? <Medal className={`inline size-4 ${a.best === 1 ? "text-gold" : "text-muted"}`} /> : null} {a.best}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="inline-flex gap-0.5" aria-label={`${titles.get(heroName(a.name))?.length ?? 0} titlar`}>
                        {Array.from({ length: titles.get(heroName(a.name))?.length ?? 0 }, (_, k) => (
                          <Trophy key={k} className="size-4 text-gold" aria-hidden />
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
