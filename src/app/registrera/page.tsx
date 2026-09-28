import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSeason, getSeasonTeams } from "@/lib/season";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Gå med" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/min-sida");
  const season = await getActiveSeason();
  const teams = season ? await getSeasonTeams(season.id) : [];
  const open = season ? new Date() <= season.registrationDeadline : false;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-14">
      <Onboarding
        teams={teams.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, logoUrl: t.logoUrl, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor }))}
        season={
          season
            ? {
                name: season.name,
                entryFee: season.entryFee,
                swishNumber: season.swishNumber,
                registrationDeadline: season.registrationDeadline.toISOString(),
                open,
              }
            : null
        }
      />
    </div>
  );
}
