import { requireAdmin } from "@/lib/auth";
import { getActiveSeason, getSeasonTeams } from "@/lib/season";
import { getOddsBoard, oddsApiEnabled } from "@/lib/odds";
import { runSync } from "@/app/actions/admin";
import { ActionButton } from "../ui";
import { OddsEditor } from "./odds-editor";

export default async function OddsAdmin() {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return null;
  const [board, teams] = await Promise.all([getOddsBoard(season.id), getSeasonTeams(season.id)]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-4xl">Odds från spelbolagen</h2>
        <p className="text-sm text-muted">
          Visas som stöd på tipssidan. {oddsApiEnabled() ? "The Odds API är aktiverat." : "Sätt ODDS_API_KEY för automatisk hämtning, eller lägg in odds på seriesegrare per spelbolag här."}
          {board.isExample && " Nuvarande odds är exempeldata från seeden."}
        </p>
      </div>
      {oddsApiEnabled() && <ActionButton action={runSync.bind(null, "odds")} variant="gold">Hämta odds nu</ActionButton>}
      <OddsEditor
        teams={teams.map((t) => ({ id: t.id, name: t.name }))}
        bookmakers={board.bookmakers}
        odds={Object.fromEntries(board.rows.map((r) => [r.team.id, r.odds]))}
      />
    </div>
  );
}
