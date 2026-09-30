import { cache } from "react";
import { db } from "@/lib/db";

/** Demoläget är på så länge seed-/demodatan finns kvar (admin kan rensa den under Admin → Översikt). */
export const isDemoMode = cache(async (): Promise<boolean> => {
  return (await db.setting.findUnique({ where: { key: "demoData" } }))?.value === "true";
});

/**
 * Anmälan är öppen fram till sista anmälningsdag. Utanför drift (utveckling, test) hålls den öppen i demoläget,
 * så att hela Swish-flödet (anmälan → notis till Anders → bekräftelse) går att testa efter deadline.
 * I drift gäller sista anmälningsdag alltid: en bortglömd demoflagga får aldrig hålla anmälan öppen efter att tipsen låsts.
 */
export async function registrationOpen(season: { registrationDeadline: Date }, now = new Date()): Promise<boolean> {
  if (now <= season.registrationDeadline) return true;
  return process.env.NODE_ENV !== "production" && (await isDemoMode());
}
