import { db } from "./db";
import type { CurrentUser } from "./auth";

/** Chatten är endast öppen för betalande/aktiva spelare (och admin). */
export async function canChat(user: Pick<CurrentUser, "id" | "role">, seasonId: string) {
  if (user.role === "ADMIN") return true;
  const entry = await db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId } } });
  return Boolean(entry && (entry.paymentStatus === "CONFIRMED" || entry.freeEntry));
}
