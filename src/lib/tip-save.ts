/**
 * Att spara ett tips. Ligger här (och inte direkt i Server Action:en) för att reglerna ska gå att testa mot en riktig
 * databas med en styrbar klocka – t.ex. att inget sparas en millisekund efter deadline.
 * Action:en (app/actions/tips.ts) sköter bara inloggning, hastighetsbegränsning och omvalidering av sidor.
 */
import { z } from "zod";
import { db } from "./db";
import { getActiveSeason, getSeasonTeams } from "./season";
import { canEditTip, validateTip } from "./tip-validation";

export const tipSchema = z.object({
  order: z.array(z.string().max(40)).length(16),
  topScorerId: z.string().max(40).nullable(),
  topAssistId: z.string().max(40).nullable(),
});

export type TipResult =
  | { ok: true; complete: boolean; message: string }
  | { ok: false; error: string; /** Nekat för att deadline passerat – formuläret ska låsas */ locked?: boolean };

const DEADLINE_ERROR = "Deadline har passerat, tipset är låst.";

export async function saveTipFor(
  user: { id: string; role: string },
  input: z.input<typeof tipSchema>,
  opts: { receivedAt?: Date; clock?: () => Date } = {},
): Promise<TipResult> {
  const clock = opts.clock ?? (() => new Date());
  // Tidpunkten då anropet kom in: det är den som räknas mot deadline, inte hur lång tid resten av funktionen tar
  const receivedAt = opts.receivedAt ?? clock();
  const parsed = tipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Ogiltigt tips." };
  const { order, topScorerId, topAssistId } = parsed.data;

  const season = await getActiveSeason();
  if (!season) return { ok: false, error: "Ingen aktiv säsong." };
  const entry = await db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } } });
  // Deadline och betalning kontrolleras alltid på servern – oberoende av vad UI:t visar
  const allowed = canEditTip(season, entry, receivedAt, user.role === "ADMIN");
  if (!allowed.ok)
    return {
      ok: false,
      locked: allowed.reason === "DEADLINE",
      error:
        allowed.reason === "DEADLINE"
          ? DEADLINE_ERROR
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

  // Omkontroll precis före skrivningen: valideringen ovan tar några tiotals millisekunder, och inget får sparas efter deadline.
  // (Ett anrop som kom in före deadline men skrivs efter den nekas alltså också – hellre nej än ett tips efter tiden.)
  const now = clock();
  if (now.getTime() > season.editDeadline.getTime()) return { ok: false, locked: true, error: DEADLINE_ERROR };
  const msLeft = season.editDeadline.getTime() - now.getTime();
  if (msLeft < 5_000) console.log(`[tips] sparade ${user.id} ${msLeft} ms före deadline`);

  // Endast admin kan nå hit utan deltagande (canEditTip kräver annars betald entry). Adminens deltagande skapas som
  // "har swishat": det räknas i tabell och prispott först när admin bekräftat sin egen betalning – annars skulle admin
  // få en gratis plats som ökar potten med en insats som aldrig betalats.
  const createdForAdmin = !entry;
  const target =
    entry ??
    (await db.entry.upsert({
      where: { userId_seasonId: { userId: user.id, seasonId: season.id } },
      create: { userId: user.id, seasonId: season.id, paymentStatus: "CLAIMED", paymentNote: "Skapad automatiskt när administratören tippade" },
      update: {},
    }));

  const complete = Boolean(topScorerId && topAssistId);
  await db.$transaction([
    db.tipRow.deleteMany({ where: { entryId: target.id } }),
    db.tipRow.createMany({ data: order.map((teamId, i) => ({ entryId: target.id, position: i + 1, teamId })) }),
    db.entry.update({
      where: { id: target.id },
      data: { topScorerId, topAssistId, submittedAt: complete ? new Date() : null },
    }),
  ]);
  return {
    ok: true,
    complete,
    message:
      (complete ? "Tipset är sparat! Du kan ändra det fram till deadline." : "Tabellen är sparad. Välj även skytt och assistkung för att bli klar.") +
      (createdForAdmin ? " Du räknas som deltagare i tabell och pott först när du har bekräftat din egen betalning under Admin → Deltagare." : ""),
  };
}
