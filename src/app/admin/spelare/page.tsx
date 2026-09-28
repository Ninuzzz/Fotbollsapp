import { db } from "@/lib/db";
import { getActiveSeason, getSeasonTeams } from "@/lib/season";
import { PlayersEditor } from "./players-editor";

export default async function PlayersAdmin() {
  const season = await getActiveSeason();
  if (!season) return null;
  const [players, teams, tipCounts] = await Promise.all([
    db.player.findMany({ where: { seasonId: season.id }, include: { team: true }, orderBy: [{ goals: "desc" }, { assists: "desc" }, { name: "asc" }] }),
    getSeasonTeams(season.id),
    db.entry.groupBy({ by: ["topScorerId"], where: { seasonId: season.id }, _count: true }),
  ]);
  const tipped = Object.fromEntries(tipCounts.map((t) => [t.topScorerId ?? "", t._count]));
  return (
    <PlayersEditor
      teams={teams.map((t) => ({ id: t.id, name: t.name }))}
      players={players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, teamName: p.team.name, goals: p.goals, assists: p.assists, photoUrl: p.photoUrl ?? "", tipped: tipped[p.id] ?? 0 }))}
    />
  );
}
