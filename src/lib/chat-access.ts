import { db } from "./db";
import { getActiveSeason } from "./season";
import type { CurrentUser } from "./auth";

/**
 * Verifierad medlem: admin eller någon som Anders har bekräftat (betalt eller gratis plats) i den AKTIVA tävlingen.
 * Vem som helst kan skapa ett konto, så "inloggad" räcker inte för att se fullständiga namn och tips. Förra årets
 * betalning ger ingen åtkomst i år – då skulle den som inte betalat se allas tips efter deadline.
 */
export async function isMember(user: Pick<CurrentUser, "id" | "role"> | null | undefined) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const season = await getActiveSeason();
  const entry = await db.entry.findFirst({
    where: { userId: user.id, ...(season ? { seasonId: season.id } : {}), OR: [{ paymentStatus: "CONFIRMED" }, { freeEntry: true }] },
    select: { id: true },
  });
  return Boolean(entry);
}

/** Chatten är endast öppen för betalande/aktiva spelare (och admin). */
export async function canChat(user: Pick<CurrentUser, "id" | "role">, seasonId: string) {
  if (user.role === "ADMIN") return true;
  const entry = await db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId } } });
  return Boolean(entry && (entry.paymentStatus === "CONFIRMED" || entry.freeEntry));
}
