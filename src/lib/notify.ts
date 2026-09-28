import webpush from "web-push";
import { db } from "./db";

export type NotificationType = "DEADLINE" | "NEWS" | "RESULTS" | "AWARD" | "GENERAL" | "CHAT";
export type Audience = "ALL" | "MISSING_TIPS" | "PAID" | "ADMIN" | "USER";

const PREF_FIELD: Record<NotificationType, "notifyDeadline" | "notifyNews" | "notifyResults" | "notifyAwards" | "notifyChat" | null> = {
  DEADLINE: "notifyDeadline",
  NEWS: "notifyNews",
  RESULTS: "notifyResults",
  AWARD: "notifyAwards",
  CHAT: "notifyChat",
  GENERAL: null, // allmänna utskick från admin går alltid ut
};

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@allsvenskantipset.se", pub, priv);
  configured = true;
  return true;
}

export const pushEnabled = () => Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

async function audienceUserIds(audience: Audience, seasonId?: string, targetUserId?: string): Promise<string[] | null> {
  if (audience === "ALL") return null;
  if (audience === "USER") return targetUserId ? [targetUserId] : [];
  if (audience === "ADMIN") return (await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })).map((u) => u.id);
  if (!seasonId) return null;
  if (audience === "PAID") {
    const e = await db.entry.findMany({
      where: { seasonId, OR: [{ paymentStatus: "CONFIRMED" }, { freeEntry: true }] },
      select: { userId: true },
    });
    return e.map((x) => x.userId);
  }
  // MISSING_TIPS: alla användare som inte lämnat in ett komplett tips
  const submitted = await db.entry.findMany({ where: { seasonId, submittedAt: { not: null } }, select: { userId: true } });
  const done = new Set(submitted.map((s) => s.userId));
  const all = await db.user.findMany({ select: { id: true } });
  return all.map((u) => u.id).filter((id) => !done.has(id));
}

/**
 * Skapar en notis (syns i inkorgen) och skickar push till de som valt den typen.
 */
export async function sendNotification(opts: {
  type: NotificationType;
  title: string;
  body: string;
  imageUrl?: string | null;
  link?: string | null;
  audience?: Audience;
  seasonId?: string;
  authorId?: string;
  targetUserId?: string;
}) {
  const audience = opts.audience ?? "ALL";
  const notification = await db.notification.create({
    data: {
      type: opts.type,
      title: opts.title,
      body: opts.body,
      imageUrl: opts.imageUrl ?? null,
      link: opts.link ?? null,
      audience,
      targetUserId: audience === "USER" ? opts.targetUserId : null,
      authorId: opts.authorId,
    },
  });

  if (!configure()) return { notification, pushed: 0 };

  const ids = await audienceUserIds(audience, opts.seasonId, opts.targetUserId);
  const pref = PREF_FIELD[opts.type];
  const subs = await db.pushSubscription.findMany({
    where: {
      ...(ids ? { userId: { in: ids } } : {}),
      ...(pref ? { user: { [pref]: true } } : {}),
    },
  });
  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    image: opts.imageUrl ?? undefined,
    url: opts.link ?? "/notiser",
    tag: notification.id,
  });
  let pushed = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        pushed++;
      } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
      }
    }),
  );
  await db.notification.update({ where: { id: notification.id }, data: { pushed } });
  return { notification, pushed };
}

/** Notiser som en användare ska se i sin inkorg. */
export async function inboxFor(userId: string, seasonId?: string) {
  const [all, user] = await Promise.all([
    db.notification.findMany({
      where: { OR: [{ audience: { not: "USER" } }, { targetUserId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { reads: { where: { userId } } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  const allowed = new Set(["ALL", "USER"]);
  if (user?.role === "ADMIN") allowed.add("ADMIN");
  if (seasonId) {
    const entry = await db.entry.findUnique({ where: { userId_seasonId: { userId, seasonId } } });
    if (entry && (entry.paymentStatus === "CONFIRMED" || entry.freeEntry)) allowed.add("PAID");
    if (!entry?.submittedAt) allowed.add("MISSING_TIPS");
  } else {
    allowed.add("PAID").add("MISSING_TIPS");
  }
  return all.filter((n) => allowed.has(n.audience)).map(({ reads, ...n }) => ({ ...n, read: reads.length > 0 }));
}
