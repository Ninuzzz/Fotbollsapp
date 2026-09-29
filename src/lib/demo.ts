import { db } from "@/lib/db";

/** Demoläget är på så länge seed-/demodatan finns kvar (admin kan rensa den under Admin → Översikt). */
export async function isDemoMode(): Promise<boolean> {
  return (await db.setting.findUnique({ where: { key: "demoData" } }))?.value === "true";
}

/**
 * Anmälan är öppen fram till sista anmälningsdag. I demoläget hålls den alltid öppen,
 * så att hela Swish-flödet (anmälan → notis till Anders → bekräftelse) går att testa efter deadline.
 */
export async function registrationOpen(season: { registrationDeadline: Date }, now = new Date()): Promise<boolean> {
  return now <= season.registrationDeadline || (await isDemoMode());
}
