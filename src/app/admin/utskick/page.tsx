import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { pushEnabled } from "@/lib/notify";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { deleteNotification } from "@/app/actions/admin";
import { ActionButton } from "../ui";
import { Composer } from "./composer";

export default async function BroadcastAdmin() {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const [items, subs] = await Promise.all([
    db.notification.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { reads: true } } } }),
    db.pushSubscription.count(),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-4xl">Nyheter & pushnotiser</h2>
        <p className="text-sm text-muted">
          {pushEnabled() ? `${subs} enheter har aktiverat push.` : "Push är inte konfigurerat (VAPID-nycklar saknas). Utskicket syns ändå i allas inkorg."}{" "}
          Mottagare med notistypen avstängd får ingen push, men ser utskicket i inkorgen.
        </p>
      </div>
      <Composer />
      <Card>
        <h3 className="font-display mb-3 text-2xl">Tidigare utskick</h3>
        <ul className="divide-y divide-border/60">
          {items.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  {fmtDateTime(n.createdAt)} · <Badge>{n.type}</Badge> · {n.audience} · {n.pushed} push · {n._count.reads} lästa
                </p>
                <p className="font-semibold">{n.title}</p>
                <p className="line-clamp-2 text-sm text-muted">{n.body}</p>
              </div>
              <ActionButton action={deleteNotification.bind(null, n.id)} variant="ghost" className="min-h-9 px-3 text-sm" confirm="Ta bort utskicket från allas inkorg?">
                Ta bort
              </ActionButton>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
