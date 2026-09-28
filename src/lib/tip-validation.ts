export type TipValidation = {
  ok: boolean;
  /** Index (0-baserat) för rader som har ett lag som förekommer mer än en gång */
  duplicates: number[];
  /** Lag som saknas i tipset */
  missing: string[];
  /** Index för tomma rader */
  empty: number[];
};

/**
 * Får användaren spara sitt tips just nu? Kontrolleras ALLTID på servern – att dölja
 * knappen i UI:t räcker inte, eftersom vem som helst kan skicka en POST direkt.
 */
export function canEditTip(
  season: { editDeadline: Date },
  entry: { paymentStatus: string; freeEntry: boolean } | null,
  now: Date,
  isAdmin = false,
): { ok: true } | { ok: false; reason: "DEADLINE" | "UNPAID" } {
  if (now.getTime() > season.editDeadline.getTime()) return { ok: false, reason: "DEADLINE" };
  const paid = entry && (entry.paymentStatus === "CONFIRMED" || entry.freeEntry);
  if (!paid && !isAdmin) return { ok: false, reason: "UNPAID" };
  return { ok: true };
}

/** Alla lag måste placeras exakt en gång. */
export function validateTip(order: (string | null | undefined)[], allTeamIds: string[]): TipValidation {
  const count = new Map<string, number>();
  order.forEach((t) => t && count.set(t, (count.get(t) ?? 0) + 1));
  const duplicates = order.flatMap((t, i) => (t && (count.get(t) ?? 0) > 1 ? [i] : []));
  const empty = order.flatMap((t, i) => (t ? [] : [i]));
  const missing = allTeamIds.filter((id) => !count.has(id));
  const ok =
    order.length === allTeamIds.length && duplicates.length === 0 && empty.length === 0 && missing.length === 0;
  return { ok, duplicates, missing, empty };
}
