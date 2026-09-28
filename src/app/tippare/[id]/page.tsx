import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { computeLeaderboard, getActiveSeason, seasonPhase } from "@/lib/season";
import { requireUser } from "@/lib/auth";
import { Avatar } from "@/components/avatar";
import { TeamCrest } from "@/components/team-crest";
import { Badge, ButtonLink } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TipsterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = await getActiveSeason();
  if (!season) notFound();
  // Enskilda tips visas bara för inloggade deltagare
  const viewer = await requireUser();
  const entry = await db.entry.findFirst({ where: { id, seasonId: season.id } });
  if (!entry) notFound();
  // Tips är hemliga före deadline – bara ägaren och admin kan se dem
  if (seasonPhase(season) === "TIPPING" && viewer?.id !== entry.userId && viewer?.role !== "ADMIN") notFound();

  const { ranked, snapshot } = await computeLeaderboard(season.id);
  const r = ranked.find((x) => x.id === id);
  if (!r || !snapshot) notFound();
  const teamById = new Map(snapshot.rows.map((row) => [row.teamId, row.team]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <div className="flex items-center gap-5">
        <Avatar value={r.user.avatar} name={r.user.name} size={80} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">{r.rank}:a plats · {r.errors} fel</p>
          <h1 className="font-display text-5xl md:text-6xl">{r.user.name}</h1>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Badge tone="gold">Skytt: {r.topScorer ? `${r.topScorer.name} (${r.topScorer.goals} mål)` : "–"}</Badge>
        <Badge tone="info">Assist: {r.topAssist ? `${r.topAssist.name} (${r.topAssist.assists})` : "–"}</Badge>
        <Badge tone="pitch">{r.exact} exakta</Badge>
      </div>
      <ol className="mt-8 space-y-1.5">
        {r.perTeam.map((t) => {
          const team = teamById.get(t.teamId)!;
          return (
            <li key={t.teamId} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
              <span className="font-display w-8 text-center text-2xl text-muted">{t.tipped}</span>
              <TeamCrest team={team} size={24} />
              <span className="flex-1 font-semibold">{team.name}</span>
              <span className="text-sm text-muted">nu {t.actual}:a</span>
              <span className={`w-10 text-right font-display text-2xl ${t.diff === 0 ? "text-pitch" : t.diff <= 2 ? "text-gold" : "text-danger"}`}>
                {t.diff === 0 ? "✓" : t.diff}
              </span>
            </li>
          );
        })}
      </ol>
      <ButtonLink href="/tipstabell" variant="outline" className="mt-8">
        Tillbaka till tipstabellen
      </ButtonLink>
    </div>
  );
}
