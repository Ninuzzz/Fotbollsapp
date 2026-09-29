import { db } from "./db";
import { computePrizes } from "./season";

/**
 * Regel: sistaplatsen (alla som delar den) får gratis medverkan nästa år.
 * Returnerar true om användaren kom sist i förra årets avslutade tävling.
 */
export async function earnedFreeEntry(userId: string, season: { year: number }): Promise<boolean> {
  const prev = await db.season.findFirst({ where: { year: season.year - 1, isFinished: true } });
  if (!prev) return false;
  const mine = await db.entry.findUnique({ where: { userId_seasonId: { userId, seasonId: prev.id } } });
  if (!mine) return false;
  const { losers } = await computePrizes(prev.id);
  return losers.includes(mine.id);
}
