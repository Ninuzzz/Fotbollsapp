"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser, currentSessionId, hashPassword, verifyPassword } from "@/lib/auth";
import { getActiveSeason } from "@/lib/season";
import { registrationOpen } from "@/lib/demo";
import { isValidAvatar, rateLimit } from "@/lib/security";
import { sendNotification } from "@/lib/notify";
import { sanitizeText } from "@/lib/sanitize";

const prefsSchema = z.object({
  notifyDeadline: z.boolean(),
  notifyNews: z.boolean(),
  notifyResults: z.boolean(),
  notifyAwards: z.boolean(),
  notifyChat: z.boolean(),
});

export async function updatePrefs(input: z.input<typeof prefsSchema>) {
  const user = await apiUser();
  if (!user) return { ok: false };
  const p = prefsSchema.safeParse(input);
  if (!p.success) return { ok: false };
  await db.user.update({ where: { id: user.id }, data: p.data });
  revalidatePath("/notiser");
  return { ok: true };
}

export async function markAllRead() {
  const user = await apiUser();
  if (!user) return;
  const all = await db.notification.findMany({
    select: { id: true },
    where: { reads: { none: { userId: user.id } }, OR: [{ audience: { not: "USER" } }, { targetUserId: user.id }] },
  });
  if (all.length) await db.notificationRead.createMany({ data: all.map((n) => ({ userId: user.id, notificationId: n.id })) });
  revalidatePath("/", "layout");
}

const profileSchema = z.object({
  name: z
    .string()
    .transform((s) => sanitizeText(s, { maxLength: 60, multiline: false }))
    .pipe(z.string().min(2, "Namnet måste vara minst 2 tecken")),
  favoriteTeamId: z.string().max(40),
  avatar: z.string().refine(isValidAvatar, "Ogiltig avatar"),
});

export async function updateProfile(input: z.input<typeof profileSchema>) {
  const user = await apiUser();
  if (!user) return { ok: false, error: "Inte inloggad" };
  if (!rateLimit(`profile:${user.id}`, 20, 60_000).ok) return { ok: false, error: "För många ändringar, vänta en stund." };
  const p = profileSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Ogiltiga uppgifter" };
  if (!(await db.team.findUnique({ where: { id: p.data.favoriteTeamId } }))) return { ok: false, error: "Ogiltigt lag" };
  await db.user.update({ where: { id: user.id }, data: p.data });
  revalidatePath("/", "layout");
  return { ok: true };
}

const pwSchema = z.object({
  current: z.string().max(200),
  next: z.string().min(10).max(200).refine((p) => /[a-zåäö]/i.test(p) && /[0-9]/.test(p)),
});

export async function changePassword(input: z.input<typeof pwSchema>) {
  const user = await apiUser();
  if (!user) return { ok: false, error: "Inte inloggad" };
  if (!rateLimit(`pw:${user.id}`, 5, 15 * 60_000).ok) return { ok: false, error: "För många försök, vänta en stund." };
  const p = pwSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Nytt lösenord: minst 10 tecken med bokstäver och siffror." };
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(p.data.current, full.passwordHash))) return { ok: false, error: "Nuvarande lösenord stämmer inte." };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(p.data.next) } });
  // Logga ut alla andra enheter, ifall någon annan kom åt det gamla lösenordet
  const current = await currentSessionId();
  await db.session.deleteMany({ where: { userId: user.id, ...(current ? { NOT: { id: current } } : {}) } });
  return { ok: true };
}

const paySchema = z.object({ paidBy: z.string().trim().max(60).optional() });

/** Spelaren anger att hen har swishat – admin bekräftar sedan */
export async function claimPayment(input: z.input<typeof paySchema>) {
  const user = await apiUser();
  if (!user) return { ok: false };
  if (!rateLimit(`claim:${user.id}`, 5, 60 * 60_000).ok) return { ok: false, error: "Du har redan meddelat Anders. Vänta en stund." };
  const p = paySchema.safeParse(input);
  if (!p.success) return { ok: false };
  if (p.data.paidBy) p.data.paidBy = sanitizeText(p.data.paidBy, { maxLength: 60, multiline: false });
  const season = await getActiveSeason();
  if (!season) return { ok: false };
  const entry = await db.entry.findUnique({ where: { userId_seasonId: { userId: user.id, seasonId: season.id } } });
  if (entry?.paymentStatus === "CONFIRMED") return { ok: true };
  if (!entry) {
    if (!(await registrationOpen(season))) return { ok: false, error: "Anmälan är stängd" };
    await db.entry.create({ data: { userId: user.id, seasonId: season.id, paymentStatus: "CLAIMED", paidBy: p.data.paidBy || null } });
  } else if (entry.paymentStatus !== "CONFIRMED") {
    await db.entry.update({ where: { id: entry.id }, data: { paymentStatus: "CLAIMED", paidBy: p.data.paidBy || null } });
  }
  await sendNotification({
    type: "GENERAL",
    audience: "ADMIN",
    title: `${user.name} har swishat`,
    body: `${p.data.paidBy ? `Swishat av: ${p.data.paidBy}. ` : ""}Bekräfta betalningen under Admin → Deltagare.`,
    link: "/admin/deltagare?filter=claimed",
  });
  revalidatePath("/profil");
  revalidatePath("/min-sida");
  return { ok: true };
}

/**
 * GDPR: rätten att bli glömd. Raderar kontot och ALL identifierbar data:
 * sessioner, tips, deltaganden, chattmeddelanden, pushprenumerationer, följningar och lästa notiser
 * (kaskad i databasen). Kopplingar från historik/Hall of Fame nollställs (SetNull), och
 * historikrader med användarens namn tas bort.
 */
export async function deleteAccount(input: { password: string; confirm: string }) {
  const user = await apiUser();
  if (!user) return { ok: false, error: "Inte inloggad" };
  if (!rateLimit(`delete:${user.id}`, 5, 15 * 60_000).ok) return { ok: false, error: "För många försök, vänta en stund." };
  if (input.confirm !== "RADERA") return { ok: false, error: 'Skriv RADERA för att bekräfta.' };
  const full = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(String(input.password ?? "").slice(0, 200), full.passwordHash)))
    return { ok: false, error: "Fel lösenord." };
  if (full.role === "ADMIN" && (await db.user.count({ where: { role: "ADMIN" } })) <= 1)
    return { ok: false, error: "Du är enda admin. Gör någon annan till admin innan du raderar ditt konto." };
  await db.$transaction([
    // Bara rader som är KOPPLADE till kontot. Namn går att ändra fritt, så att matcha på namn skulle låta vem som
    // helst döpa om sig till t.ex. fjolårets vinnare och radera hens historik. Historik som importerats från
    // Excel utan koppling tar Anders bort manuellt om personen ber om det.
    db.hallOfFame.updateMany({ where: { userId: user.id }, data: { consent: false } }),
    db.historicalResult.deleteMany({ where: { userId: user.id } }),
    db.user.delete({ where: { id: user.id } }),
  ]);
  const { destroySession } = await import("@/lib/auth");
  await destroySession().catch(() => {});
  redirect("/?raderat=1");
}
