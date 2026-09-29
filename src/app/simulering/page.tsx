import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSeason, getLatestSnapshot, getSeasonTeams } from "@/lib/season";
import { parseSplit } from "@/lib/prizes";
import { ratingsFromStandings } from "@/lib/simulation";
import { Empty, PageHeader } from "@/components/ui";
import { Simulator } from "./simulator";

export const metadata = { title: "Simulering" };
export const dynamic = "force-dynamic";

/**
 * Simuleringsläget skickar bara offentlig data (lag, loggor, spelarnamn) till webbläsaren.
 * Säsongen spelas i webbläsaren och ingenting skrivs till databasen.
 */
export default async function SimulationPage() {
  const season = await getActiveSeason();
  if (!season) return <Empty title="Ingen säsong">Skapa en säsong i admin först.</Empty>;
  const [teams, snapshot, scorers, assisters, user] = await Promise.all([
    getSeasonTeams(season.id),
    getLatestSnapshot(season.id),
    db.player.findMany({ where: { seasonId: season.id }, orderBy: [{ goals: "desc" }, { assists: "desc" }], take: 14 }),
    db.player.findMany({ where: { seasonId: season.id }, orderBy: [{ assists: "desc" }, { goals: "desc" }], take: 10 }),
    getCurrentUser(),
  ]);
  const ratings = ratingsFromStandings(
    (snapshot?.rows ?? []).map((r) => ({ teamId: r.teamId, position: r.position, points: r.points, played: r.played })),
    teams.length,
  );
  const position = new Map(snapshot?.rows.map((r) => [r.teamId, r.position]) ?? []);
  const players = [...new Map([...scorers, ...assisters].map((p) => [p.id, p])).values()];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker="Demo · inget sparas" title="Simulering">
        Tippa en påhittad säsong och se hur du stiger och faller omgång för omgång, mot ett gäng fejkade motståndare. Poäng, utslagsfrågor,
        utmärkelser och prispott räknas precis som i det riktiga tipset.
      </PageHeader>
      <Simulator
        teams={teams
          .map((t) => ({
            id: t.id,
            name: t.name,
            shortName: t.shortName,
            logoUrl: t.logoUrl,
            primaryColor: t.primaryColor,
            secondaryColor: t.secondaryColor,
            rating: ratings.get(t.id) ?? 1500,
          }))
          .sort((a, b) => (position.get(a.id) ?? 99) - (position.get(b.id) ?? 99) || a.name.localeCompare(b.name, "sv"))}
        players={players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, goalWeight: p.goals, assistWeight: p.assists }))}
        you={{ name: user ? user.name.split(" ")[0]! : "Du", avatar: user?.avatar ?? "jersey:solid:#f5c518:#050b08:10" }}
        economy={{ entryFee: season.entryFee, reservedAmount: season.reservedAmount, split: parseSplit(season.prizeSplit) }}
      />
    </div>
  );
}
