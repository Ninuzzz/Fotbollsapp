/**
 * Prispottsfördelning enligt reglerna:
 *
 *  - `reservedAmount` (600 kr) avsätts till mugg, vandringspris och tröstpris
 *    (sistaplatsen får gratis medverkan året därpå).
 *  - Resten av potten fördelas 1:an 50 %, 2:an 30 %, 3:an 20 %.
 *
 * Finstilt vid delade placeringar – alla fall följer samma princip:
 * tippare som delar placering r (n st) "täcker" prisplatserna r … r+n−1
 * och delar lika på summan av de platserna.
 *  - 3+ delar 1:a  → plats 1–3 → hela potten
 *  - 2 delar 1:a   → plats 1–2 (3:an får sin del)
 *  - 2+ delar 2:a  → plats 2–3
 *  - 2+ delar 3:e  → plats 3
 */

export type PrizeConfig = {
  entryFee: number;
  participants: number;
  reservedAmount: number;
  /** Procent per prisplats, t.ex. [50, 30, 20] */
  split: number[];
};

export function prizePool({ entryFee, participants, reservedAmount }: PrizeConfig): number {
  return Math.max(0, entryFee * participants - reservedAmount);
}

export function parseSplit(s: string): number[] {
  const parts = s.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
  return parts.length ? parts : [50, 30, 20];
}

export type Payout = { id: string; rank: number; amount: number; places: number[]; shared: number };

/**
 * @param ranked tippare med rank (delade placeringar = samma rank)
 * @returns utbetalning per tippare som får pengar. Beloppen avrundas nedåt till hela kronor.
 */
export function distributePrizes(
  ranked: { id: string; rank: number }[],
  pool: number,
  split: number[] = [50, 30, 20],
): Payout[] {
  const groups = new Map<number, string[]>();
  for (const r of ranked) {
    const g = groups.get(r.rank) ?? [];
    g.push(r.id);
    groups.set(r.rank, g);
  }
  const payouts: Payout[] = [];
  for (const [rank, ids] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    if (rank > split.length) break;
    const places: number[] = [];
    for (let p = rank; p < rank + ids.length && p <= split.length; p++) places.push(p);
    const pct = places.reduce((s, p) => s + split[p - 1], 0);
    const each = Math.floor((pool * pct) / 100 / ids.length);
    for (const id of ids) payouts.push({ id, rank, amount: each, places, shared: ids.length });
  }
  return payouts;
}

/** Sistaplatsen (alla som delar den) får gratis medverkan nästa år. */
export function lastPlace(ranked: { id: string; rank: number }[]): string[] {
  if (ranked.length < 2) return [];
  const worst = Math.max(...ranked.map((r) => r.rank));
  return ranked.filter((r) => r.rank === worst).map((r) => r.id);
}
