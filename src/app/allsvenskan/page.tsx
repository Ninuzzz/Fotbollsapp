import { Goal, Handshake } from "lucide-react";
import { PlayerFace } from "@/components/player-face";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveSeason, getLatestSnapshot } from "@/lib/season";
import { LeagueTable } from "@/components/league-table";
import { PageHeader, SectionTitle, Empty } from "@/components/ui";
import { TeamCrest } from "@/components/team-crest";
import { Reveal } from "@/components/motion";
import { relative } from "@/lib/format";

export const metadata = { title: "Allsvenskan" };
export const dynamic = "force-dynamic";

type P = { id: string; name: string; goals: number; assists: number; photoUrl: string | null; team: { name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string } };

function Podium({ players, stat, icon: Icon, title }: { players: P[]; stat: "goals" | "assists"; icon: typeof Goal; title: string }) {
  const top = players.slice(0, 3);
  const rest = players.slice(3, 10);
  return (
    <div>
      <SectionTitle>
        <span className="flex items-center gap-2">
          <Icon className="size-7 text-gold" /> {title}
        </span>
      </SectionTitle>
      <div className="grid grid-cols-3 items-end gap-3">
        {[top[1], top[0], top[2]].map((p, i) =>
          p ? (
            <Reveal key={p.id} delay={i * 0.1}>
              <div className={`card flex flex-col items-center p-3 text-center ${i === 1 ? "glow-gold pb-6 pt-5" : ""}`}>
                <PlayerFace name={p.name} photoUrl={p.photoUrl} team={p.team} size={i === 1 ? 96 : 64} />
                <p className="mt-2 line-clamp-2 text-sm font-semibold">{p.name}</p>
                <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <TeamCrest team={p.team} size={14} /> {p.team.shortName}
                </div>
                <p className={`font-display mt-1 ${i === 1 ? "text-6xl text-gold" : "text-4xl"}`}>{p[stat]}</p>
              </div>
            </Reveal>
          ) : (
            <div key={i} />
          ),
        )}
      </div>
      <ol className="mt-4 divide-y divide-border/60 rounded-2xl border border-border" start={4}>
        {rest.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 text-muted tabular-nums">{i + 4}</span>
            <TeamCrest team={p.team} size={18} />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="font-bold tabular-nums">{p[stat]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function LeaguePage() {
  const season = await getActiveSeason();
  if (!season) return null;
  const user = await getCurrentUser();
  const [snapshot, scorers, assisters, entry] = await Promise.all([
    getLatestSnapshot(season.id),
    db.player.findMany({ where: { seasonId: season.id, goals: { gt: 0 } }, include: { team: true }, orderBy: [{ goals: "desc" }, { assists: "desc" }], take: 10 }),
    db.player.findMany({ where: { seasonId: season.id, assists: { gt: 0 } }, include: { team: true }, orderBy: [{ assists: "desc" }, { goals: "desc" }], take: 10 }),
    user ? db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } }, include: { rows: true } }) : null,
  ]);
  const tipped = entry?.rows.length ? new Map(entry.rows.map((r) => [r.teamId, r.position])) : undefined;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker={`Allsvenskan ${season.year}`} title="Tabell & ligor">
        {snapshot ? (
          <>
            Efter omgång {snapshot.round} · uppdaterad {relative(snapshot.createdAt)}
            {snapshot.source === "API" ? " automatiskt" : snapshot.source === "MANUAL" ? " manuellt av admin" : ""}.
            {tipped && " Kolumnen Tips visar din tippade placering och antal fel."}
          </>
        ) : (
          "Säsongen har inte börjat än."
        )}
      </PageHeader>
      {snapshot ? (
        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <LeagueTable rows={snapshot.rows} tipped={tipped} highlightTeamId={user?.favoriteTeamId} />
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-gold" /> Topp 3</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-danger/40" /> Kvalplats</span>
              <span className="flex items-center gap-1.5"><span className="h-3 w-1 rounded bg-danger" /> Nedflyttning</span>
            </div>
          </div>
          <div className="space-y-12">
            <Podium players={scorers} stat="goals" icon={Goal} title="Skytteligan" />
            <Podium players={assisters} stat="assists" icon={Handshake} title="Assistligan" />
          </div>
        </div>
      ) : (
        <Empty title="Ingen tabell än">Tabellen dyker upp här efter första omgången.</Empty>
      )}
    </div>
  );
}
