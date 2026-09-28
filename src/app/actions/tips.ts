"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { getActiveSeason, getSeasonTeams } from "@/lib/season";
import { canEditTip, validateTip } from "@/lib/tip-validation";
import { rateLimit } from "@/lib/security";

const schema = z.object({
  order: z.array(z.string().max(40)).length(16),
  topScorerId: z.string().max(40).nullable(),
  topAssistId: z.string().max(40).nullable(),
});

export async function saveTip(input: z.input<typeof schema>) {
  const user = await apiUser();
  if (!user) return { ok: false, error: "Du måste vara inloggad." };
  if (!rateLimit(`tip:${user.id}`, 30, 60_000).ok) return { ok: false, error: "Lugn i stormen, vänta en stund." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ogiltigt tips." };
  const { order, topScorerId, topAssistId } = parsed.data;

  const season = await getActiveSeason();
  if (!season) return { ok: false, error: "Ingen aktiv säsong." };
  const entry = await db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } } });
  // Deadline och betalning kontrolleras alltid på servern – oberoende av vad UI:t visar
  const allowed = canEditTip(season, entry, new Date(), user.role === "ADMIN");
  if (!allowed.ok)
    return {
      ok: false,
      error:
        allowed.reason === "DEADLINE"
          ? "Deadline har passerat, tipset är låst."
          : "Väntar på betalningsbekräftelse. Du kan spara ditt tips när Anders har bekräftat din Swish.",
    };

  const teams = await getSeasonTeams(season.id);
  const v = validateTip(order, teams.map((t) => t.id));
  if (!v.ok) return { ok: false, error: "Alla 16 lag måste placeras exakt en gång." };

  for (const pid of [topScorerId, topAssistId]) {
    if (pid && !(await db.player.findFirst({ where: { id: pid, seasonId: season.id } }))) {
      return { ok: false, error: "Ogiltig spelare." };
    }
  }

  // Endast admin kan nå hit utan deltagande (canEditTip kräver annars betald entry)
  const target = entry ?? (await db.entry.create({ data: { userId: user.id, seasonId: season.id, paymentStatus: "CONFIRMED" } }));

  const complete = Boolean(topScorerId && topAssistId);
  await db.$transaction([
    db.tipRow.deleteMany({ where: { entryId: target.id } }),
    db.tipRow.createMany({ data: order.map((teamId, i) => ({ entryId: target.id, position: i + 1, teamId })) }),
    db.entry.update({
      where: { id: target.id },
      data: { topScorerId, topAssistId, submittedAt: complete ? new Date() : null },
    }),
  ]);
  revalidatePath("/tipsa");
  revalidatePath("/min-sida");
  return {
    ok: true,
    complete,
    message: complete ? "Tipset är sparat! Du kan ändra det fram till deadline." : "Tabellen är sparad. Välj även skytt och assistkung för att bli klar.",
  };
}
