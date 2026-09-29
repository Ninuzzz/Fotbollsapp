import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveSeason } from "@/lib/season";
import { TeamsEditor } from "./teams-editor";

export default async function TeamsAdmin() {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const season = await getActiveSeason();
  const [teams, inSeason] = await Promise.all([
    db.team.findMany({ orderBy: { name: "asc" } }),
    season ? db.seasonTeam.findMany({ where: { seasonId: season.id } }) : Promise.resolve([]),
  ]);
  const ids = new Set(inSeason.map((s) => s.teamId));
  return (
    <TeamsEditor
      seasonName={season?.name ?? ""}
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        shortName: t.shortName,
        aliases: t.aliases,
        primaryColor: t.primaryColor,
        secondaryColor: t.secondaryColor,
        logoUrl: t.logoUrl ?? "",
        starPlayer: t.starPlayer ?? "",
        starPlayerPhoto: t.starPlayerPhoto ?? "",
        inSeason: ids.has(t.id),
      }))}
    />
  );
}
