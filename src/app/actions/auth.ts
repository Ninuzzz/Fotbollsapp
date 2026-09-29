"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { getActiveSeason } from "@/lib/season";
import { registrationOpen } from "@/lib/demo";
import { clientIp, isValidAvatar, rateLimit } from "@/lib/security";
import { sanitizeText } from "@/lib/sanitize";
import { sendNotification } from "@/lib/notify";

const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 11);

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: boolean; message?: string } | undefined;

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") ?? "").slice(0, 200);
  // Brute force-skydd: per IP och per konto
  const ip = await clientIp();
  const a = rateLimit(`login:ip:${ip}`, 20, 15 * 60_000);
  const b = rateLimit(`login:acct:${email}`, 8, 15 * 60_000);
  if (!a.ok || !b.ok) return { error: `För många inloggningsförsök. Försök igen om ${Math.ceil(Math.max(a.retryAfter, b.retryAfter) / 60)} min.` };
  const user = await db.user.findUnique({ where: { email } });
  // Kör alltid bcrypt så att svarstiden inte avslöjar om kontot finns
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    return { error: "Fel e-post eller lösenord." };
  }
  await createSession(user.id);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/min-sida");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

const registerSchema = z.object({
  name: z
    .string()
    .transform((s) => sanitizeText(s, { maxLength: 60, multiline: false }))
    .pipe(z.string().min(2, "Skriv ditt namn (minst 2 tecken)")),
  email: z.email("Ogiltig e-postadress").transform((s) => s.toLowerCase()),
  password: z
    .string()
    .min(10, "Minst 10 tecken")
    .max(200)
    .refine((p) => /[a-zåäö]/i.test(p) && /[0-9]/.test(p), "Använd både bokstäver och siffror"),
  favoriteTeamId: z.string().min(1, "Välj ett favoritlag").max(40),
  avatar: z.string().refine(isValidAvatar, "Ogiltig avatar"),
  payment: z.enum(["SELF", "OTHER", "LATER"]),
  paidBy: z
    .string()
    .transform((s) => sanitizeText(s, { maxLength: 60, multiline: false }))
    .optional(),
  // GDPR: måste aktivt godkänna integritetspolicyn
  acceptPrivacy: z.literal(true, { error: "Du behöver godkänna integritetspolicyn" }),
});

export async function register(input: z.input<typeof registerSchema>): Promise<FormState> {
  const rl = rateLimit(`register:${await clientIp()}`, 5, 60 * 60_000);
  if (!rl.ok) return { error: "För många registreringar från din anslutning. Försök igen senare." };
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { error: "Kontrollera uppgifterna.", fieldErrors };
  }
  const d = parsed.data;
  if (d.payment === "OTHER" && !d.paidBy) return { error: "Skriv namn eller initialer på den som swishar.", fieldErrors: { paidBy: "Obligatoriskt" } };
  if (!(await db.team.findUnique({ where: { id: d.favoriteTeamId } }))) return { error: "Välj ett giltigt lag." };
  if (await db.user.findUnique({ where: { email: d.email } })) {
    return { error: "Det finns redan ett konto med den e-postadressen.", fieldErrors: { email: "Används redan" } };
  }
  const user = await db.user.create({
    data: {
      name: d.name,
      email: d.email,
      passwordHash: await hashPassword(d.password),
      favoriteTeamId: d.favoriteTeamId,
      avatar: d.avatar,
      privacyAcceptedAt: new Date(),
    },
  });
  const season = await getActiveSeason();
  if (season && (await registrationOpen(season))) {
    await db.entry.create({
      data: {
        userId: user.id,
        seasonId: season.id,
        paymentStatus: d.payment === "LATER" ? "PENDING" : "CLAIMED",
        paidBy: d.payment === "OTHER" ? d.paidBy : null,
      },
    });
    // Anders får en notis om den nya registreringen
    await sendNotification({
      type: "GENERAL",
      audience: "ADMIN",
      title: `Ny deltagare: ${d.name}`,
      body:
        d.payment === "LATER"
          ? "Har inte swishat än."
          : `Säger sig ha swishat${d.payment === "OTHER" && d.paidBy ? ` (swishat av ${d.paidBy})` : ""}. Bekräfta under Admin → Deltagare.`,
      link: "/admin/deltagare?filter=claimed",
    }).catch(() => {});
  }
  await createSession(user.id);
  return { ok: true };
}
