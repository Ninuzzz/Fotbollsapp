import { db } from "./db";
import type { CurrentUser } from "./auth";

/**
 * Verifierad medlem: admin eller någon som Anders har bekräftat (betalt eller gratis plats) någon säsong.
 * Vem som helst kan skapa ett konto, så "inloggad" räcker inte för att se fullständiga namn och tips.
 */
export async function isMember(user: Pick<CurrentUser, "id" | "role"> | null | undefined) {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  const entry = await db.entry.findFirst({
    where: { userId: user.id, OR: [{ paymentStatus: "CONFIRMED" }, { freeEntry: true }] },
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
