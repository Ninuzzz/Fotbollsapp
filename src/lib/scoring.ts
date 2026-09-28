/**
 * Poängsystem för Allsvenskantipset.
 *
 * - Varje lag ger |tippad placering − verklig placering| fel. Minst antal fel vinner.
 * - Tie-breakers (i ordning):
 *   1. Närmast antal mål på tippad skytteligavinnare (= flest mål av den tippade spelaren)
 *   2. Närmast antal assist på tippad assistligavinnare
 *   3. Flest lag på exakt rätt placering
 *   4. Går det fortfarande inte att skilja dem åt delar de placeringen.
 */

export type TeamDiff = {
  teamId: string;
  tipped: number;
  actual: number;
  /** Absolut antal placeringar fel */
  diff: number;
  /** Signerad: positiv = laget ligger bättre till än tippat */
  delta: number;
};

export type ErrorResult = {
  total: number;
  exact: number;
  perTeam: TeamDiff[];
};

/** Räknar ut fel för ett tips mot en tabell. Båda är teamId → placering. */
export function computeErrors(
  tip: Map<string, number> | Record<string, number>,
  actual: Map<string, number> | Record<string, number>,
): ErrorResult {
  const tipMap = tip instanceof Map ? tip : new Map(Object.entries(tip));
  const actualMap = actual instanceof Map ? actual : new Map(Object.entries(actual));
  const perTeam: TeamDiff[] = [];
  let total = 0;
  let exact = 0;
  for (const [teamId, tipped] of tipMap) {
    const act = actualMap.get(teamId);
    if (act === undefined) continue;
    const diff = Math.abs(tipped - act);
    total += diff;
    if (diff === 0) exact++;
    perTeam.push({ teamId, tipped, actual: act, diff, delta: tipped - act });
  }
  perTeam.sort((a, b) => a.tipped - b.tipped);
  return { total, exact, perTeam };
}

export type RankInput = {
  id: string;
  errors: number;
  exact: number;
  /** Mål gjorda av den tippade skytteligavinnaren (null = ej tippat) */
  scorerGoals: number | null;
  /** Assist gjorda av den tippade assistligavinnaren (null = ej tippat) */
  assistCount: number | null;
};

export type Ranked<T extends RankInput = RankInput> = T & {
  rank: number;
  /** Hur många mål den tippade skytten ligger efter skytteligaledaren */
  scorerGap: number | null;
  assistGap: number | null;
  /** Vilken regel som avgjorde mot spelaren ovanför (för UI-förklaring) */
  decidedBy: "errors" | "scorer" | "assist" | "exact" | "shared" | null;
};

/** Jämför två tippare. Negativt tal = a placerar sig före b. */
export function compareEntries(
  a: RankInput,
  b: RankInput,
  leaderGoals: number,
  leaderAssists: number,
): { cmp: number; rule: Ranked["decidedBy"] } {
  if (a.errors !== b.errors) return { cmp: a.errors - b.errors, rule: "errors" };
  const gA = gap(leaderGoals, a.scorerGoals);
  const gB = gap(leaderGoals, b.scorerGoals);
  if (gA !== gB) return { cmp: gA - gB, rule: "scorer" };
  const aA = gap(leaderAssists, a.assistCount);
  const aB = gap(leaderAssists, b.assistCount);
  if (aA !== aB) return { cmp: aA - aB, rule: "assist" };
  if (a.exact !== b.exact) return { cmp: b.exact - a.exact, rule: "exact" };
  return { cmp: 0, rule: "shared" };
}

function gap(leader: number, value: number | null): number {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, leader - value);
}

/**
 * Rangordnar tippare. Delade placeringar får samma rank (1, 2, 2, 4 …).
 * leaderGoals/leaderAssists = skytte-/assistligaledarens antal (default: högsta bland de tippade).
 */
export function rankEntries<T extends RankInput>(
  entries: T[],
  leaderGoals?: number,
  leaderAssists?: number,
): Ranked<T>[] {
  const lg = leaderGoals ?? Math.max(0, ...entries.map((e) => e.scorerGoals ?? 0));
  const la = leaderAssists ?? Math.max(0, ...entries.map((e) => e.assistCount ?? 0));
  const sorted = [...entries].sort((a, b) => compareEntries(a, b, lg, la).cmp);
  const out: Ranked<T>[] = [];
  sorted.forEach((e, i) => {
    let rank = i + 1;
    let decidedBy: Ranked["decidedBy"] = null;
    if (i > 0) {
      const prev = out[i - 1];
      const { cmp, rule } = compareEntries(prev, e, lg, la);
      decidedBy = rule;
      if (cmp === 0) rank = prev.rank;
    }
    out.push({
      ...e,
      rank,
      decidedBy,
      scorerGap: e.scorerGoals === null ? null : Math.max(0, lg - e.scorerGoals),
      assistGap: e.assistCount === null ? null : Math.max(0, la - e.assistCount),
    });
  });
  return out;
}

/** Det bästa möjliga resultatet: 0 fel. Det sämsta för 16 lag är 128. */
export const MAX_ERRORS_16 = 128;
