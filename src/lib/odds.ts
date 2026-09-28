/**
 * Odds från spelbolag som stöd vid tipsningen.
 * Källa 1: The Odds API (ODDS_API_KEY) – outright-marknad för seriesegrare.
 * Källa 2: odds som admin lagt in manuellt (t.ex. Unibet, Svenska Spel, Bet365).
 */
import { db } from "./db";
import { matchTeam } from "./teams-data";
import { getSeasonTeams } from "./season";

export const oddsApiEnabled = () => Boolean(process.env.ODDS_API_KEY);

type OddsApiEvent = {
  bookmakers: { key: string; title: string; markets: { key: string; outcomes: { name: string; price: number }[] }[] }[];
};

export async function syncOdds(seasonId: string) {
  const sport = process.env.ODDS_OUTRIGHT_SPORT ?? "soccer_sweden_allsvenskan_winner";
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?regions=eu,uk&markets=outrights&oddsFormat=decimal&apiKey=${process.env.ODDS_API_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`The Odds API ${res.status}: ${await res.text()}`);
  const events = (await res.json()) as OddsApiEvent[];
  const teams = await getSeasonTeams(seasonId);
  let n = 0;
  for (const ev of events)
    for (const bm of ev.bookmakers)
      for (const m of bm.markets.filter((x) => x.key === "outrights"))
        for (const o of m.outcomes) {
          const team = matchTeam(o.name, teams);
          if (!team) continue;
          await db.oddsQuote.upsert({
            where: { seasonId_teamId_bookmaker_market: { seasonId, teamId: team.id, bookmaker: bm.title, market: "WINNER" } },
            create: { seasonId, teamId: team.id, bookmaker: bm.title, market: "WINNER", odds: o.price, source: "API" },
            update: { odds: o.price, source: "API" },
          });
          n++;
        }
  return n;
}

export type OddsBoard = {
  bookmakers: string[];
  rows: {
    team: { id: string; name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string };
    odds: Record<string, number>;
    /** Normaliserad sannolikhet (marginalen borttagen), 0–1 */
    probability: number;
    /** Placering enligt marknaden */
    marketRank: number;
  }[];
  isExample: boolean;
};

export async function getOddsBoard(seasonId: string): Promise<OddsBoard> {
  const quotes = await db.oddsQuote.findMany({ where: { seasonId, market: "WINNER" }, include: { team: true } });
  const bookmakers = [...new Set(quotes.map((q) => q.bookmaker))].sort();
  const teams = await getSeasonTeams(seasonId);
  // Per bolag: implicit sannolikhet 1/odds, normaliserad så att summan = 1
  const probSum = new Map<string, number>();
  for (const b of bookmakers)
    probSum.set(b, quotes.filter((q) => q.bookmaker === b).reduce((s, q) => s + 1 / q.odds, 0));
  const rows = teams.map((t) => {
    const qs = quotes.filter((q) => q.teamId === t.id);
    const probs = qs.map((q) => 1 / q.odds / (probSum.get(q.bookmaker) || 1));
    return {
      team: t,
      odds: Object.fromEntries(qs.map((q) => [q.bookmaker, q.odds])),
      probability: probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0,
      marketRank: 0,
    };
  });
  rows.sort((a, b) => b.probability - a.probability);
  rows.forEach((r, i) => (r.marketRank = i + 1));
  return { bookmakers, rows, isExample: quotes.length > 0 && quotes.every((q) => q.source === "SEED") };
}
