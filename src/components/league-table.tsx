import { TeamCrest } from "./team-crest";

type Row = {
  teamId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form: string;
  team: { name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string };
};

function FormDot({ r }: { r: string }) {
  const map: Record<string, [string, string]> = {
    W: ["bg-pitch text-[#03170b]", "V"],
    D: ["bg-surface-3 text-muted", "O"],
    L: ["bg-danger text-white", "F"],
  };
  const [c, l] = map[r] ?? map.D;
  const title = r === "W" ? "Vinst" : r === "L" ? "Förlust" : "Oavgjort";
  return (
    <span className={`grid size-5 place-items-center rounded-full text-[10px] font-bold ${c}`} title={title} aria-label={title}>
      {l}
    </span>
  );
}

/** Verklig Allsvenskan-tabell. Zonfärger: guld = seriesegrare/Europa, röd = nedflyttning. */
export function LeagueTable({
  rows,
  compact = false,
  tipped,
  highlightTeamId,
}: {
  rows: Row[];
  compact?: boolean;
  /** teamId → tippad placering, visar egen diff */
  tipped?: Map<string, number>;
  highlightTeamId?: string | null;
}) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-border">
      <table className="w-full min-w-[320px] text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-3 py-3 text-left" scope="col">#</th>
            <th className="px-2 py-3 text-left" scope="col">Lag</th>
            <th className="px-2 py-3 text-right" scope="col" title="Spelade matcher">MP</th>
            {!compact && (
              <>
                <th className="hidden px-2 py-3 text-right sm:table-cell" scope="col">V</th>
                <th className="hidden px-2 py-3 text-right sm:table-cell" scope="col">O</th>
                <th className="hidden px-2 py-3 text-right sm:table-cell" scope="col">F</th>
                <th className="hidden px-2 py-3 text-right md:table-cell" scope="col">Mål</th>
              </>
            )}
            <th className="px-2 py-3 text-right" scope="col" title="Målskillnad">+/−</th>
            <th className="px-3 py-3 text-right" scope="col">P</th>
            {!compact && <th className="hidden px-3 py-3 text-left lg:table-cell" scope="col">Form</th>}
            {tipped && <th className="px-3 py-3 text-right" scope="col" title="Ditt tips">Tips</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const zone = r.position <= 3 ? "border-l-gold" : r.position >= 15 ? "border-l-danger" : r.position === 14 ? "border-l-danger/40" : "border-l-transparent";
            const tip = tipped?.get(r.teamId);
            const diff = tip !== undefined ? Math.abs(tip - r.position) : null;
            return (
              <tr
                key={r.teamId}
                className={`border-t border-border/70 border-l-[3px] ${zone} ${highlightTeamId === r.teamId ? "bg-team/10" : "odd:bg-surface/40"}`}
              >
                <td className="px-3 py-2.5 font-display text-xl text-muted tabular-nums">{r.position}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <TeamCrest team={r.team} size={24} />
                    <span className="font-semibold">
                      <span className="hidden sm:inline">{r.team.name}</span>
                      <span className="sm:hidden">{r.team.name.replace(/^(IF|IK|BK|IFK) /, "")}</span>
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-muted">{r.played}</td>
                {!compact && (
                  <>
                    <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{r.won}</td>
                    <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{r.drawn}</td>
                    <td className="hidden px-2 py-2.5 text-right tabular-nums sm:table-cell">{r.lost}</td>
                    <td className="hidden px-2 py-2.5 text-right tabular-nums text-muted md:table-cell">
                      {r.goalsFor}–{r.goalsAgainst}
                    </td>
                  </>
                )}
                <td className="px-2 py-2.5 text-right tabular-nums text-muted">
                  {r.goalsFor - r.goalsAgainst > 0 ? "+" : ""}
                  {r.goalsFor - r.goalsAgainst}
                </td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums">{r.points}</td>
                {!compact && (
                  <td className="hidden px-3 py-2.5 lg:table-cell">
                    <div className="flex gap-1">
                      {r.form.split("").map((f, i) => (
                        <FormDot key={i} r={f} />
                      ))}
                    </div>
                  </td>
                )}
                {tipped && (
                  <td className="px-3 py-2.5 text-right">
                    {tip !== undefined && (
                      <span
                        className={`inline-flex min-w-24 justify-end gap-1.5 whitespace-nowrap tabular-nums font-semibold ${
                          diff === 0 ? "text-pitch" : diff! <= 2 ? "text-gold" : "text-danger"
                        }`}
                        title={`Du tippade ${tip}:a – ${diff} fel`}
                      >
                        <span className="text-muted">{tip}:a</span>
                        <span aria-hidden className="text-faint">·</span>
                        {diff === 0 ? "✓ exakt" : `${diff} fel`}
                      </span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
