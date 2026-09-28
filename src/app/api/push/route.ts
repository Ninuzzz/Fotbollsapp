import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { assertSameOrigin, rateLimit } from "@/lib/security";

const schema = z.object({
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "Endast https"),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
});

export async function POST(req: NextRequest) {
  if (!(await assertSameOrigin())) return NextResponse.json({ error: "Ogiltig begäran" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  if (!rateLimit(`push:${user.id}`, 10, 60_000).ok) return NextResponse.json({ error: "För många" }, { status: 429 });
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Ogiltig prenumeration" }, { status: 400 });
  await db.pushSubscription.upsert({
    where: { endpoint: p.data.endpoint },
    create: { userId: user.id, endpoint: p.data.endpoint, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth },
    update: { userId: user.id, p256dh: p.data.keys.p256dh, auth: p.data.keys.auth },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await assertSameOrigin())) return NextResponse.json({ error: "Ogiltig begäran" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const endpoint = (await req.json().catch(() => ({})))?.endpoint;
  if (typeof endpoint === "string") await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
