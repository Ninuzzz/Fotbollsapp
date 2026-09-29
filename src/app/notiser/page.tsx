import { Bell, CalendarClock, Megaphone, Newspaper, Rocket, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { inboxFor, pushEnabled } from "@/lib/notify";
import { getActiveSeason } from "@/lib/season";
import { PageHeader, Empty } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { markAllRead } from "@/app/actions/profile";
import { db } from "@/lib/db";
import { NotificationSettings } from "./settings";

export const metadata = { title: "Notiser" };
export const dynamic = "force-dynamic";

const ICON = { DEADLINE: CalendarClock, NEWS: Newspaper, RESULTS: Trophy, AWARD: Rocket, GENERAL: Megaphone, CHAT: Bell } as const;
const LABEL = { DEADLINE: "Deadline", NEWS: "Nyhet", RESULTS: "Resultat", AWARD: "Utmärkelse", GENERAL: "Från Anders", CHAT: "Chatt" } as const;

export default async function NotificationsPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  const [items, prefs] = await Promise.all([
    inboxFor(user.id, season?.id),
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { notifyDeadline: true, notifyNews: true, notifyResults: true, notifyAwards: true, notifyChat: true },
    }),
  ]);
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
      <PageHeader kicker="Inkorg" title="Notiser">
        Alla utskick samlade, så att du kan läsa det du missat i efterhand.
      </PageHeader>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Notishistorik">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-muted">{unread ? `${unread} olästa` : "Allt läst"}</p>
            {unread > 0 && (
              <form action={markAllRead}>
                <button className="min-h-10 cursor-pointer rounded-lg px-3 text-sm font-semibold text-gold hover:bg-surface-3">Markera alla som lästa</button>
              </form>
            )}
          </div>
          {items.length ? (
            <ul className="space-y-3">
              {items.map((n) => {
                const Icon = ICON[n.type as keyof typeof ICON] ?? Bell;
                return (
                  <li key={n.id} className={`card flex gap-4 p-4 ${n.read ? "opacity-75" : "border-gold/40"}`}>
                    <div className={`grid size-11 shrink-0 place-items-center rounded-xl ${n.read ? "bg-surface-3 text-muted" : "bg-gold/15 text-gold"}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted">
                        {LABEL[n.type as keyof typeof LABEL] ?? n.type} · {fmtDateTime(n.createdAt)}
                        {!n.read && <span className="ml-2 font-bold text-gold">NY</span>}
                      </p>
                      <h2 className="mt-0.5 font-semibold">{n.title}</h2>
                      <p className="mt-1 whitespace-pre-line text-sm text-muted">{n.body}</p>
                      {n.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={n.imageUrl} alt="" className="mt-3 max-h-64 rounded-xl object-cover" loading="lazy" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title="Inga notiser än" />
          )}
        </section>
        <aside>
          <NotificationSettings initial={prefs} vapidKey={pushEnabled() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY! : null} />
        </aside>
      </div>
    </div>
  );
}
