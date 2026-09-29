import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getActiveSeason, getSeasonTeams, seasonPhase } from "@/lib/season";
import { getOddsBoard } from "@/lib/odds";
import { PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { TipForm } from "./tip-form";
import { PaymentWaiting } from "@/components/payment-waiting";
import { earnedFreeEntry } from "@/lib/free-entry";

export const metadata = { title: "Mitt tips" };

export default async function TipPage({ searchParams }: { searchParams: Promise<{ valkommen?: string }> }) {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) return null;
  const { valkommen } = await searchParams;
  const [teams, entry, players, odds] = await Promise.all([
    getSeasonTeams(season.id),
    db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } }, include: { rows: { orderBy: { position: "asc" } } } }),
    db.player.findMany({ where: { seasonId: season.id }, include: { team: true }, orderBy: [{ goals: "desc" }, { name: "asc" }] }),
    getOddsBoard(season.id),
  ]);
  const locked = seasonPhase(season) !== "TIPPING";
  const initial = entry?.rows.length === 16 ? entry.rows.map((r) => r.teamId) : Array<string | null>(16).fill(null);
  const paid = user.role === "ADMIN" || Boolean(entry && (entry.paymentStatus === "CONFIRMED" || entry.freeEntry));

  // Obetald: ingen tipsning förrän Anders bekräftat Swish (servern kontrollerar detsamma i saveTip)
  if (!locked && !paid) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
        <PageHeader kicker={season.name} title="Tippa sluttabellen" />
        <PaymentWaiting
          status={entry?.paymentStatus ?? "PENDING"}
          fee={season.entryFee}
          swish={season.swishNumber}
          paidBy={entry?.paidBy ?? ""}
          context="tips"
          freeEarned={!entry && (await earnedFreeEntry(user.id, season))}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      {valkommen && (
        <div className="mb-6 rounded-2xl border border-pitch/40 bg-pitch-dim/40 p-4">
          <p className="font-semibold text-pitch">Välkommen till tipset, {user.name.split(" ")[0]}!</p>
          <p className="text-sm text-muted">Nu är det dags att tippa. Du kan spara och ändra fritt fram till deadline.</p>
        </div>
      )}
      <PageHeader kicker={season.name} title={locked ? "Ditt tips" : "Tippa sluttabellen"}>
        {locked ? (
          <>Tipset låstes {fmtDateTime(season.editDeadline)}. Nu är det bara att luta sig tillbaka och hoppas.</>
        ) : (
          <>
            Placera alla 16 lag från 1 till 16. Dra i handtaget eller välj lag i listan. Du kan ändra fritt fram till{" "}
            <strong className="text-text">{fmtDateTime(season.editDeadline)}</strong>.
          </>
        )}
      </PageHeader>
      <TipForm
        teams={teams.map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, logoUrl: t.logoUrl, primaryColor: t.primaryColor, secondaryColor: t.secondaryColor }))}
        players={players.map((p) => ({ id: p.id, name: p.name, teamName: p.team.name, goals: p.goals, assists: p.assists, photoUrl: p.photoUrl }))}
        initialOrder={initial}
        initialScorer={entry?.topScorerId ?? null}
        initialAssist={entry?.topAssistId ?? null}
        locked={locked}
        odds={odds}
        showStats={locked}
      />
    </div>
  );
}
