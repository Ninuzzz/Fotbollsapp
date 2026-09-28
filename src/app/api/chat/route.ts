import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { getActiveSeason } from "@/lib/season";
import { canChat } from "@/lib/chat-access";
import { assertSameOrigin, rateLimit } from "@/lib/security";
import { sanitizeText } from "@/lib/sanitize";

const select = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: { id: true, name: true, avatar: true, role: true } },
} as const;

async function guard() {
  const user = await apiUser();
  if (!user) return { error: NextResponse.json({ error: "Inte inloggad" }, { status: 401 }) };
  const season = await getActiveSeason();
  if (!season || !(await canChat(user, season.id)))
    return { error: NextResponse.json({ error: "Chatten är öppen för betalande spelare" }, { status: 403 }) };
  return { user, season };
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if ("error" in g) return g.error;
  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
  const messages = await db.chatMessage.findMany({
    where: { seasonId: g.season.id, ...(afterDate ? { createdAt: { gt: afterDate } } : {}) },
    orderBy: { createdAt: afterDate ? "asc" : "desc" },
    take: afterDate ? 100 : 80,
    select,
  });
  return NextResponse.json({ messages: afterDate ? messages : messages.reverse() }, { headers: { "Cache-Control": "no-store" } });
}

const postSchema = z.object({ body: z.string().trim().min(1).max(1000) });

export async function POST(req: NextRequest) {
  if (!(await assertSameOrigin())) return NextResponse.json({ error: "Ogiltig begäran" }, { status: 403 });
  const g = await guard();
  if ("error" in g) return g.error;
  const rl = rateLimit(`chat:${g.user.id}`, 10, 30_000);
  if (!rl.ok) return NextResponse.json({ error: `Lugn nu! Vänta ${rl.retryAfter} s.` }, { status: 429 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Meddelandet måste vara 1–1000 tecken" }, { status: 400 });
  // Sparas som ren text (aldrig HTML); React escapar vid rendering och CSP blockerar inline-skript
  const body = sanitizeText(parsed.data.body, { maxLength: 1000 });
  if (!body) return NextResponse.json({ error: "Tomt meddelande" }, { status: 400 });
  const message = await db.chatMessage.create({
    data: { seasonId: g.season.id, userId: g.user.id, body },
    select,
  });
  return NextResponse.json({ message });
}

export async function DELETE(req: NextRequest) {
  if (!(await assertSameOrigin())) return NextResponse.json({ error: "Ogiltig begäran" }, { status: 403 });
  const user = await apiUser();
  if (!user) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const msg = await db.chatMessage.findUnique({ where: { id } });
  if (!msg) return NextResponse.json({ error: "Finns inte" }, { status: 404 });
  // Egna meddelanden eller admin (moderering)
  if (msg.userId !== user.id && user.role !== "ADMIN") return NextResponse.json({ error: "Nekad" }, { status: 403 });
  await db.chatMessage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
