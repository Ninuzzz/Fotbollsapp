"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { apiUser } from "@/lib/auth";
import { rateLimit } from "@/lib/security";
import { saveTipFor, type tipSchema } from "@/lib/tip-save";

/** Server Action: inloggning, hastighetsbegränsning och sidomvalidering. Reglerna (deadline, betalning) finns i saveTipFor. */
export async function saveTip(input: z.input<typeof tipSchema>) {
  // Tidpunkten då anropet kom in: det är den som räknas mot deadline
  const receivedAt = new Date();
  const user = await apiUser();
  if (!user) return { ok: false as const, error: "Du måste vara inloggad." };
  if (!rateLimit(`tip:${user.id}`, 30, 60_000).ok) return { ok: false as const, error: "Lugn i stormen, vänta en stund." };
  const res = await saveTipFor(user, input, { receivedAt });
  if (res.ok) {
    revalidatePath("/tipsa");
    revalidatePath("/min-sida");
  }
  return res;
}
