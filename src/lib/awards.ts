/**
 * Utmärkelser vid varje uppdatering av tipstabellen:
 *  - Veckans raket:      flest placeringar uppåt sedan förra uppdateringen
 *  - Veckans djupdykning: flest placeringar nedåt
 *  - Veckans jojo:       mest totalt fram och tillbaka de senaste uppdateringarna
 */

export type AwardKind = "ROCKET" | "DIVE" | "YOYO";
export type AwardResult = { kind: AwardKind; entryIds: string[]; delta: number };

export function computeAwards(
  previous: Map<string, number>,
  current: Map<string, number>,
  /** Äldre → nyare rank-historik per entry, för jojo (inklusive current) */
  history?: Map<string, number[]>,
): AwardResult[] {
  const moves: { id: string; move: number }[] = [];
  for (const [id, rank] of current) {
    const prev = previous.get(id);
    if (prev === undefined) continue;
    moves.push({ id, move: prev - rank }); // positivt = klättrat
  }
  const out: AwardResult[] = [];
  const best = Math.max(0, ...moves.map((m) => m.move));
  if (best > 0) out.push({ kind: "ROCKET", delta: best, entryIds: moves.filter((m) => m.move === best).map((m) => m.id) });
  const worst = Math.min(0, ...moves.map((m) => m.move));
  if (worst < 0) out.push({ kind: "DIVE", delta: -worst, entryIds: moves.filter((m) => m.move === worst).map((m) => m.id) });

  if (history) {
    const yoyo: { id: string; swing: number }[] = [];
    for (const [id, ranks] of history) {
      // Jojo kräver riktningsbyten – summa av |förändring| när riktningen byts
      let swing = 0;
      let lastDir = 0;
      let changes = 0;
      for (let i = 1; i < ranks.length; i++) {
        const d = ranks[i] - ranks[i - 1];
        if (d === 0) continue;
        const dir = Math.sign(d);
        if (lastDir !== 0 && dir !== lastDir) changes++;
        swing += Math.abs(d);
        lastDir = dir;
      }
      if (changes > 0) yoyo.push({ id, swing });
    }
    const top = Math.max(0, ...yoyo.map((y) => y.swing));
    if (top > 0) out.push({ kind: "YOYO", delta: top, entryIds: yoyo.filter((y) => y.swing === top).map((y) => y.id) });
  }
  return out;
}

export const AWARD_LABEL: Record<AwardKind, string> = {
  ROCKET: "Veckans raket",
  DIVE: "Veckans djupdykning",
  YOYO: "Veckans jojo",
};
