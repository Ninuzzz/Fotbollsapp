import { getActiveSeason, getLatestSnapshot, getSeasonTeams } from "@/lib/season";
import { StandingsEditor } from "./editor";

export default async function StandingsAdmin() {
  const season = await getActiveSeason();
  if (!season) return null;
  const [teams, snap] = await Promise.all([getSeasonTeams(season.id), getLatestSnapshot(season.id)]);
  const rows = snap?.rows.length
    ? snap.rows.map((r) => ({ teamId: r.teamId, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, points: r.points }))
    : teams.map((t) => ({ teamId: t.id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }));
  return (
    <div className="space-y-4">
      <h2 className="font-display text-4xl">Uppdatera tabellen manuellt</h2>
      <p className="text-muted">
        Används om API-synken skulle fallera. Ordningen här blir placeringarna. Sortera med “Sortera på poäng” eller flytta lag med pilarna. När du sparar
        räknas tipstabellen om och veckans utmärkelser koras.
      </p>
      <StandingsEditor teams={teams.map((t) => ({ id: t.id, name: t.name }))} initial={rows} />
    </div>
  );
}
