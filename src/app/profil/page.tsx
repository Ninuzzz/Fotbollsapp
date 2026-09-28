import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveSeason, getSeasonTeams } from "@/lib/season";
import { PageHeader } from "@/components/ui";
import { ProfileForms } from "./forms";

export const metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  const [teams, entry] = await Promise.all([
    season ? getSeasonTeams(season.id) : db.team.findMany(),
    season ? db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } } }) : null,
  ]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker="Konto" title="Profil & inställningar" />
      <ProfileForms
        user={{ name: user.name, email: user.email, avatar: user.avatar, favoriteTeamId: user.favoriteTeamId ?? "" }}
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        payment={
          season
            ? {
                status: entry ? (entry.freeEntry ? "FREE" : entry.paymentStatus) : "NONE",
                paidBy: entry?.paidBy ?? "",
                fee: season.entryFee,
                swish: season.swishNumber,
                season: season.name,
              }
            : null
        }
      />
    </div>
  );
}
