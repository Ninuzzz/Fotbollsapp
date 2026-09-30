/**
 * Kontroll av en hämtad eller inmatad tabell INNAN den sparas.
 *
 * Tabellen styr tipstabellen, notiser och prispengar, så en trasig tabell (t.ex. ett API som halvvägs har uppdaterats
 * eller saknar ett fält) får aldrig publiceras tyst. Kontrollerna bygger på sådant som alltid måste gälla i en serietabell:
 * varje match ger exakt en vinnare och en förlorare (eller två oavgjorda) och varje mål är ett insläppt mål för någon annan.
 */
export type StandingCheckRow = {
  teamId: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

export type StandingCheckOptions = {
  expectedTeams: number;
  totalRounds: number;
  /** Senast sparade tabell – spelade matcher får aldrig minska */
  previous?: { teamId: string; played: number }[] | null;
  /** lag-id → namn, för läsbara felmeddelanden */
  names?: Map<string, string>;
};

const FIELDS = ["position", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "points"] as const;
const MAX_ISSUES = 10;

/** Returnerar en lista med problem. Tom lista = tabellen ser rimlig ut. */
export function validateStandings(rows: StandingCheckRow[], opts: StandingCheckOptions): string[] {
  const issues: string[] = [];
  const label = (id: string) => opts.names?.get(id) ?? id;

  if (rows.length !== opts.expectedTeams) issues.push(`Tabellen har ${rows.length} lag, förväntade ${opts.expectedTeams}.`);
  if (new Set(rows.map((r) => r.teamId)).size !== rows.length) issues.push("Något lag förekommer mer än en gång.");

  // Ogiltiga tal gör alla övriga kontroller meningslösa – avbryt direkt
  for (const r of rows)
    for (const k of FIELDS)
      if (!Number.isInteger(r[k]) || r[k] < 0) {
        issues.push(`${label(r.teamId)}: ogiltigt värde för ${k} (${String(r[k])}).`);
        return issues.slice(0, MAX_ISSUES);
      }

  const positions = rows.map((r) => r.position).sort((a, b) => a - b);
  if (!positions.every((p, i) => p === i + 1)) issues.push(`Placeringarna är inte 1–${rows.length} exakt en gång vardera.`);

  for (const r of rows) {
    const sum = r.won + r.drawn + r.lost;
    if (sum !== r.played) issues.push(`${label(r.teamId)}: V+O+F (${sum}) stämmer inte med spelade matcher (${r.played}).`);
    const pts = 3 * r.won + r.drawn;
    if (pts !== r.points) issues.push(`${label(r.teamId)}: poängen (${r.points}) stämmer inte med 3×V+O (${pts}). Poängavdrag?`);
    if (r.played > opts.totalRounds) issues.push(`${label(r.teamId)}: ${r.played} spelade matcher, men serien har bara ${opts.totalRounds} omgångar.`);
  }

  const total = (k: "goalsFor" | "goalsAgainst" | "won" | "lost" | "drawn") => rows.reduce((s, r) => s + r[k], 0);
  if (total("goalsFor") !== total("goalsAgainst"))
    issues.push(`Målen går inte ihop: ${total("goalsFor")} gjorda men ${total("goalsAgainst")} insläppta i hela serien (halvuppdaterad tabell?).`);
  if (total("won") !== total("lost")) issues.push(`Vinster (${total("won")}) och förluster (${total("lost")}) går inte ihop i hela serien.`);
  if (total("drawn") % 2 !== 0) issues.push(`Antalet oavgjorda (${total("drawn")}) måste vara jämnt i hela serien.`);

  const byPos = [...rows].sort((a, b) => a.position - b.position);
  for (let i = 0; i + 1 < byPos.length; i++)
    if (byPos[i]!.points < byPos[i + 1]!.points)
      issues.push(`${label(byPos[i]!.teamId)} ligger före ${label(byPos[i + 1]!.teamId)} men har färre poäng.`);

  if (opts.previous?.length) {
    const prev = new Map(opts.previous.map((p) => [p.teamId, p.played]));
    for (const r of rows) {
      const before = prev.get(r.teamId);
      if (before !== undefined && r.played < before) issues.push(`${label(r.teamId)}: spelade matcher minskar (${before} → ${r.played}). Gammal data?`);
    }
  }

  return issues.slice(0, MAX_ISSUES);
}
