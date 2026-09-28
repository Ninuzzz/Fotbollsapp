import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/auth";
import { rateLimit } from "@/lib/security";

/** GDPR: rätt till tillgång – användaren laddar ner all data vi har om hen. */
export async function GET() {
  const me = await apiUser();
  if (!me) return NextResponse.json({ error: "Inte inloggad" }, { status: 401 });
  if (!rateLimit(`export:${me.id}`, 5, 60 * 60_000).ok) return NextResponse.json({ error: "För många" }, { status: 429 });
  const user = await db.user.findUniqueOrThrow({
    where: { id: me.id },
    select: {
      name: true,
      email: true,
      role: true,
      avatar: true,
      createdAt: true,
      privacyAcceptedAt: true,
      notifyDeadline: true,
      notifyNews: true,
      notifyResults: true,
      notifyAwards: true,
      notifyChat: true,
      favoriteTeam: { select: { name: true } },
      entries: {
        select: {
          season: { select: { name: true } },
          paymentStatus: true,
          paidBy: true,
          paidAt: true,
          submittedAt: true,
          freeEntry: true,
          topScorer: { select: { name: true } },
          topAssist: { select: { name: true } },
          rows: { select: { position: true, team: { select: { name: true } } }, orderBy: { position: "asc" } },
        },
      },
      messages: { select: { body: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      following: { select: { followed: { select: { name: true } } } },
      pushSubs: { select: { createdAt: true } },
      history: { select: { year: true, rank: true, errors: true } },
    },
  });
  return new NextResponse(JSON.stringify({ exportedAt: new Date().toISOString(), ...user }, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="allsvenskantipset-mina-uppgifter.json"',
      "cache-control": "no-store",
    },
  });
}
