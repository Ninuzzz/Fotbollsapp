import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSeason, getSeasonTeams } from "@/lib/season";
import { isDemoMode, registrationOpen } from "@/lib/demo";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Gå med" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/min-sida");
  const season = await getActiveSeason();
  const teams = season ? await getSeasonTeams(season.id) : [];
  const [open, demo] = season ? await Promise.all([registrationOpen(season), isDemoMode()]) : [false, false];
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
                // Demotipset om att inte swisha på riktigt gäller bara när anmälan faktiskt är öppen
                demo: demo && open,
              }
            : null
        }
      />
    </div>
  );
}
