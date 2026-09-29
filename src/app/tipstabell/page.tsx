import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { computePrizes, getActiveSeason, latestAwards, rankHistory, seasonPhase } from "@/lib/season";
import { PageHeader, SectionTitle } from "@/components/ui";
import { AwardCards } from "@/components/awards";
import { Reveal } from "@/components/motion";
import { kr } from "@/lib/format";
import { publicAvatar, publicName, publicUser } from "@/lib/privacy";
import { isMember } from "@/lib/chat-access";
import { Leaderboard } from "./leaderboard";

export const metadata = { title: "Tipstabellen" };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const user = await getCurrentUser();
  const season = await getActiveSeason();
  if (!season) return null;
  // Fullständiga namn och tips bara för bekräftade deltagare (alla kan skapa konto)
  const member = await isMember(user);
  const [prizes, awards, history, follows] = await Promise.all([
    computePrizes(season.id),
    latestAwards(season.id),
    rankHistory(season.id),
    user ? db.follow.findMany({ where: { followerId: user.id } }) : Promise.resolve([]),
  ]);
  const { ranked, payouts, losers, pool } = prizes;
  const round = history.at(-1)?.round ?? 0;
  const payoutById = Object.fromEntries(payouts.map((p) => [p.id, p.amount]));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker={`${season.name} · efter omgång ${round}`} title="Tipstabellen">
        Minst antal fel leder. Vid lika avgör skytteligan, sedan assistligan och sist antal exakta placeringar. Prispott just nu: <strong className="text-gold">{kr(pool)}</strong>.
      </PageHeader>

      <Leaderboard
        me={user?.id ?? null}
        tipsVisible={member && seasonPhase(season) !== "TIPPING"}
        entries={ranked.map((r) => ({
          id: r.id,
          userId: r.user.id,
          name: publicName(r.user.name, member),
          avatar: publicAvatar(r.user.avatar, member),
          rank: r.rank,
          previousRank: r.previousRank,
          errors: r.errors,
          exact: r.exact,
          scorer: r.topScorer ? `${r.topScorer.name} (${r.topScorer.goals})` : "–",
          assist: r.topAssist ? `${r.topAssist.name} (${r.topAssist.assists})` : "–",
          decidedBy: r.decidedBy,
          payout: payoutById[r.id] ?? 0,
          last: losers.includes(r.id),
        }))}
        following={follows.map((f) => f.followedId)}
        history={history}
      />

      <section className="mt-16" id="utmarkelser">
        <Reveal>
          <SectionTitle>Veckans utmärkelser</SectionTitle>
        </Reveal>
        <AwardCards awards={awards.map((a) => ({ ...a, user: a.user ? publicUser(a.user, member) : null }))} />
      </section>
      {!member && (
        <p className="mt-6 text-sm text-muted">
          {user ? (
            <>Du ser bara initialer tills Anders har bekräftat din betalning. Därefter syns namn, tips och grafer för hela gänget.</>
          ) : (
            <>
              Som besökare ser du bara initialer. <a href="/logga-in" className="font-semibold text-gold underline">Logga in</a> för att se namn, tips och grafer
              för hela gänget.
            </>
          )}
        </p>
      )}
    </div>
  );
}
