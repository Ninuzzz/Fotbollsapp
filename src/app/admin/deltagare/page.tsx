import { requireAdmin } from "@/lib/auth";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { getActiveSeason } from "@/lib/season";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { deleteEntry, setFreeEntry, setPayment, setRole } from "@/app/actions/admin";
import { ActionButton } from "../ui";

const FILTERS = { all: "Alla", claimed: "Väntar på bekräftelse", unpaid: "Obetalda", missing: "Saknar tips" } as const;

export default async function EntriesAdmin({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const season = await getActiveSeason();
  if (!season) return null;
  const { filter = "all" } = await searchParams;
  const entries = await db.entry.findMany({
    where: {
      seasonId: season.id,
      ...(filter === "claimed" ? { paymentStatus: "CLAIMED" } : {}),
      ...(filter === "unpaid" ? { paymentStatus: { not: "CONFIRMED" }, freeEntry: false } : {}),
      ...(filter === "missing" ? { submittedAt: null } : {}),
    },
    include: { user: true },
    orderBy: [{ paymentStatus: "asc" }, { user: { name: "asc" } }],
  });
  const noEntry = await db.user.findMany({ where: { entries: { none: { seasonId: season.id } } }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <h2 className="font-display text-4xl">Deltagare {season.year}</h2>
      <div className="flex flex-wrap gap-2">
        {Object.entries(FILTERS).map(([k, l]) => (
          <Link
            key={k}
            href={`/admin/deltagare?filter=${k}`}
            className={`min-h-10 rounded-xl px-4 py-2 text-sm font-semibold ${filter === k ? "bg-gold text-[#1f1800]" : "bg-surface-2 text-muted hover:text-text"}`}
          >
            {l}
          </Link>
        ))}
      </div>
      <div className="relative overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-3 text-left">Deltagare</th>
              <th className="px-2 py-3 text-left">Betalning</th>
              <th className="px-2 py-3 text-left">Swishat av</th>
              <th className="px-2 py-3 text-left">Tips</th>
              <th className="px-3 py-3 text-right">Åtgärder</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border/70 align-top odd:bg-surface/40">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar value={e.user.avatar} size={32} />
                    <div>
                      <p className="font-semibold">
                        {e.user.name} {e.user.role === "ADMIN" && <Badge tone="gold">admin</Badge>}
                      </p>
                      <p className="text-xs text-muted">{e.user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-2 py-3">
                  {e.freeEntry ? (
                    <Badge tone="info">Gratis</Badge>
                  ) : e.paymentStatus === "CONFIRMED" ? (
                    <Badge tone="pitch">Betald {e.paidAt ? fmtDate(e.paidAt) : ""}</Badge>
                  ) : e.paymentStatus === "CLAIMED" ? (
                    <Badge tone="gold">Säger sig ha swishat</Badge>
                  ) : (
                    <Badge tone="danger">Ej betald</Badge>
                  )}
                </td>
                <td className="px-2 py-3 text-muted">{e.paidBy ?? "–"}</td>
                <td className="px-2 py-3">{e.submittedAt ? <span className="text-pitch">Inlämnat</span> : <span className="text-danger">Saknas</span>}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-nowrap justify-end gap-1 whitespace-nowrap">
                    {e.paymentStatus !== "CONFIRMED" ? (
                      <ActionButton action={setPayment.bind(null, e.id, "CONFIRMED")} variant="primary" className="min-h-9 px-3 text-sm">
                        Bekräfta betalning
                      </ActionButton>
                    ) : (
                      <ActionButton action={setPayment.bind(null, e.id, "PENDING")} variant="ghost" className="min-h-9 px-3 text-sm" confirm="Ångra betalningen?">
                        Ångra betalning
                      </ActionButton>
                    )}
                    <ActionButton action={setFreeEntry.bind(null, e.id, !e.freeEntry)} variant="ghost" className="min-h-9 px-3 text-sm">
                      {e.freeEntry ? "Ta bort gratis" : "Gratisplats"}
                    </ActionButton>
                    <details className="relative">
                      <summary
                        className="grid size-11 cursor-pointer list-none place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-text [&::-webkit-details-marker]:hidden"
                        aria-label={`Fler åtgärder för ${e.user.name}`}
                      >
                        <MoreHorizontal className="size-5" />
                      </summary>
                      <div className="absolute right-0 z-20 mt-1 flex w-52 flex-col gap-1 rounded-xl border border-border-strong bg-surface p-2 shadow-2xl">
                        <ActionButton
                          action={setRole.bind(null, e.userId, e.user.role === "ADMIN" ? "USER" : "ADMIN")}
                          variant="ghost"
                          className="w-full justify-start text-sm"
                          confirm={e.user.role === "ADMIN" ? "Ta bort adminbehörighet?" : `Göra ${e.user.name} till admin?`}
                        >
                          {e.user.role === "ADMIN" ? "Ta bort admin" : "Gör till admin"}
                        </ActionButton>
                        <ActionButton action={deleteEntry.bind(null, e.id)} variant="ghost" className="w-full justify-start text-sm text-danger" confirm={`Ta bort ${e.user.name}s deltagande och tips?`}>
                          Ta bort deltagande
                        </ActionButton>
                      </div>
                    </details>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {noEntry.length > 0 && (
        <p className="text-sm text-muted">
          Konton utan deltagande i år: {noEntry.map((u) => u.name).join(", ")}
        </p>
      )}
    </div>
  );
}
