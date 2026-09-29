/**
 * Simuleringsläge: en påhittad säsong som spelas omgång för omgång helt i webbläsaren.
 * Inget sparas – det används för att visa hur tipset fungerar (t.ex. för Anders).
 *
 * Allt styrs av ett slumpfrö, så samma frö ger exakt samma säsong igen.
 * Poäng, utslagsfrågor, utmärkelser och priser räknas med samma funktioner som den riktiga appen.
 */
import { computeAwards, type AwardResult } from "./awards";
import { distributePrizes, lastPlace, prizePool, type Payout } from "./prizes";
import { computeErrors, rankEntries } from "./scoring";

export type SimTeam = { id: string; name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string; rating: number };
export type SimPlayer = { id: string; name: string; teamId: string; goalWeight: number; assistWeight: number };
export type SimTipper = { id: string; name: string; avatar: string; isYou?: boolean; order: string[]; scorerId: string | null; assistId: string | null };

export type SimStanding = { teamId: string; position: number; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; points: number; previous: number | null };
export type SimMatch = { home: string; away: string; hg: number; ag: number; upset: boolean };
export type SimRankRow = { id: string; rank: number; previousRank: number | null; errors: number; exact: number; decidedBy: string | null };
export type SimRound = {
  round: number;
  standings: SimStanding[];
  matches: SimMatch[];
  goals: Record<string, number>;
  assists: Record<string, number>;
  ranking: SimRankRow[];
  awards: AwardResult[];
};
export type SimResult = { rounds: SimRound[]; payouts: Payout[]; losers: string[]; pool: number };

/** mulberry32 – liten, snabb och deterministisk */
export function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof createRng>;

export function gauss(rng: Rng) {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function poisson(rng: Rng, lambda: number) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 12);
  return k - 1;
}

function shuffle<T>(arr: T[], rng: Rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T | undefined {
  const total = items.reduce((s, t) => s + weight(t), 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items.at(-1);
}

/** Dubbelserie med cirkelmetoden: varje lag möter alla två gånger, en gång hemma och en borta. */
export function buildSchedule(teamIds: string[], rng: Rng): [string, string][][] {
  const ids = shuffle(teamIds, rng);
  if (ids.length % 2) ids.push("__vilar");
  const n = ids.length;
  const first: [string, string][][] = [];
  const rot = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = rot[i]!;
      const b = rot[n - 1 - i]!;
      if (a !== "__vilar" && b !== "__vilar") pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    first.push(pairs);
    rot.splice(1, 0, rot.pop()!);
  }
  return [...first, ...first.map((round) => round.map(([h, a]) => [a, h] as [string, string]))];
}

/** Tipsare med påhittade namn – lagom fotbollsfåniga */
export const BOT_NAMES = [
  "Kalle Kanon", "Stina Stolpe", "Offside-Olle", "Hörn-Hanna", "Straff-Sven", "Tunnel-Tove", "Libero-Lars", "Volley-Vera",
  "Frispark-Fia", "Målvakts-Mats", "Dribbel-Doris", "Krysset-Kent", "Nick-Nora", "Bredsida-Bengt", "Glidtackling-Gun", "Returen-Rolf",
  "Stolpin-Siv", "Sidledes-Sture", "Tåfjutt-Tina", "Hattrick-Harald",
];

/**
 * Motståndarnas tips: den nuvarande tabellen plus brus. Vissa är skarpa, andra tippar vilt.
 * `baseOrder` = lagen i den ordning de "borde" sluta (starkast först).
 */
export function botTippers(count: number, baseOrder: string[], players: SimPlayer[], rng: Rng): SimTipper[] {
  const palette = ["#1d4ed8", "#dc2626", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#ea580c", "#475569"];
  const patterns = ["solid", "stripes", "hoops", "sash", "half"];
  return BOT_NAMES.slice(0, count).map((name, i) => {
    const spread = 1.2 + rng() * 4.5;
    const order = [...baseOrder]
      .map((id, idx) => ({ id, key: idx + gauss(rng) * spread }))
      .sort((a, b) => a.key - b.key)
      .map((x) => x.id);
    const scorer = pickWeighted(players, (p) => p.goalWeight ** 2, rng);
    const assist = pickWeighted(players, (p) => p.assistWeight ** 2, rng);
    const c1 = palette[i % palette.length]!;
    const c2 = palette[(i + 3) % palette.length]!;
    return {
      id: `bot${i}`,
      name,
      avatar: `jersey:${patterns[i % patterns.length]}:${c1}:${c2}:${1 + ((i * 7) % 23)}`,
      order,
      scorerId: scorer?.id ?? null,
      assistId: assist?.id ?? null,
    };
  });
}

export type SimConfig = {
  seed: number;
  teams: SimTeam[];
  players: SimPlayer[];
  tippers: SimTipper[];
  rounds?: number;
  /** 0 = favoriterna vinner nästan alltid, 1 = rena lotteriet */
  chaos: number;
  entryFee: number;
  reservedAmount: number;
  split: number[];
};

/** Spelar hela säsongen i förväg; gränssnittet visar sedan en omgång i taget. */
export function simulateSeason(cfg: SimConfig): SimResult {
  const rng = createRng(cfg.seed);
  const teamIds = cfg.teams.map((t) => t.id);
  const rating = new Map(cfg.teams.map((t) => [t.id, t.rating]));
  const schedule = buildSchedule(teamIds, rng).slice(0, cfg.rounds ?? 30);
  const nameOf = new Map(cfg.teams.map((t) => [t.id, t.name]));

  const table = new Map(teamIds.map((id) => [id, { teamId: id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }]));
  const goals: Record<string, number> = Object.fromEntries(cfg.players.map((p) => [p.id, 0]));
  const assists: Record<string, number> = Object.fromEntries(cfg.players.map((p) => [p.id, 0]));
  const byTeam = new Map<string, SimPlayer[]>();
  for (const p of cfg.players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);

  const rounds: SimRound[] = [];
  let prevPositions = new Map<string, number>();
  let prevRanks = new Map<string, number>();
  const rankHistory = new Map<string, number[]>();
  const damp = 1 - Math.min(1, Math.max(0, cfg.chaos)) * 0.85;

  schedule.forEach((pairs, idx) => {
    const matches: SimMatch[] = [];
    for (const [h, a] of pairs) {
      const d = ((rating.get(h) ?? 1500) - (rating.get(a) ?? 1500)) * damp;
      const hg = poisson(rng, 1.45 * 10 ** (d / 700));
      const ag = poisson(rng, 1.15 * 10 ** (-d / 700));
      matches.push({ home: h, away: a, hg, ag, upset: (d > 90 && ag > hg) || (d < -90 && hg > ag) });
      const H = table.get(h)!;
      const A = table.get(a)!;
      H.played++; A.played++;
      H.gf += hg; H.ga += ag; A.gf += ag; A.ga += hg;
      if (hg > ag) { H.won++; A.lost++; H.points += 3; }
      else if (hg < ag) { A.won++; H.lost++; A.points += 3; }
      else { H.drawn++; A.drawn++; H.points++; A.points++; }
      // Målskyttar och assist bland spelarna i poolen
      for (const [team, n] of [[h, hg], [a, ag]] as const) {
        const squad = byTeam.get(team) ?? [];
        for (let g = 0; g < n; g++) {
          if (!squad.length || rng() > 0.5) continue;
          const scorer = pickWeighted(squad, (p) => p.goalWeight + 0.5, rng);
          if (!scorer) continue;
          goals[scorer.id] = (goals[scorer.id] ?? 0) + 1;
          if (rng() < 0.45) {
            const helper = pickWeighted(squad.filter((p) => p.id !== scorer.id), (p) => p.assistWeight + 0.5, rng);
            if (helper) assists[helper.id] = (assists[helper.id] ?? 0) + 1;
          }
        }
      }
    }

    const sorted = [...table.values()].sort(
      (x, y) => y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || (nameOf.get(x.teamId) ?? "").localeCompare(nameOf.get(y.teamId) ?? "", "sv"),
    );
    const standings: SimStanding[] = sorted.map((r, i) => ({ ...r, position: i + 1, previous: prevPositions.get(r.teamId) ?? null }));
    const actual = new Map(standings.map((s) => [s.teamId, s.position]));

    const leaderGoals = Math.max(0, ...Object.values(goals));
    const leaderAssists = Math.max(0, ...Object.values(assists));
    const ranked = rankEntries(
      cfg.tippers.map((t) => {
        const e = computeErrors(new Map(t.order.map((id, i) => [id, i + 1])), actual);
        return {
          id: t.id,
          errors: e.total,
          exact: e.exact,
          scorerGoals: t.scorerId ? goals[t.scorerId] ?? 0 : null,
          assistCount: t.assistId ? assists[t.assistId] ?? 0 : null,
        };
      }),
      leaderGoals,
      leaderAssists,
    );
    const ranks = new Map(ranked.map((r) => [r.id, r.rank]));
    for (const [id, r] of ranks) rankHistory.set(id, [...(rankHistory.get(id) ?? []), r].slice(-5));
    const awards = idx === 0 ? [] : computeAwards(prevRanks, ranks, rankHistory);

    rounds.push({
      round: idx + 1,
      standings,
      matches,
      goals: { ...goals },
      assists: { ...assists },
      ranking: ranked.map((r) => ({
        id: r.id,
        rank: r.rank,
        previousRank: prevRanks.get(r.id) ?? null,
        errors: r.errors,
        exact: r.exact,
        decidedBy: r.decidedBy === "errors" ? null : r.decidedBy,
      })),
      awards,
    });
    prevPositions = actual;
    prevRanks = ranks;
  });

  const final = rounds.at(-1)?.ranking ?? [];
  const pool = prizePool({ entryFee: cfg.entryFee, participants: cfg.tippers.length, reservedAmount: cfg.reservedAmount, split: cfg.split });
  return { rounds, pool, payouts: distributePrizes(final, pool, cfg.split), losers: lastPlace(final) };
}

/** Styrka ur den riktiga tabellen: bättre placering och fler poäng per match ger högre rating. */
export function ratingsFromStandings(rows: { teamId: string; position: number; points: number; played: number }[], count: number) {
  const out = new Map<string, number>();
  for (const r of rows) {
    const ppg = r.played ? r.points / r.played : 1.4;
    out.set(r.teamId, 1500 + (count / 2 - r.position) * 9 + (ppg - 1.4) * 140);
  }
  return out;
}
