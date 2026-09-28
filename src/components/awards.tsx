import { Rocket, TrendingDown, Repeat } from "lucide-react";
import { Avatar } from "./avatar";
import type { AwardKind } from "@/lib/awards";

const META: Record<AwardKind, { label: string; icon: typeof Rocket; tone: string; verb: (d: number) => string }> = {
  ROCKET: { label: "Veckans raket", icon: Rocket, tone: "text-pitch from-pitch/25", verb: (d) => `+${d} placeringar` },
  DIVE: { label: "Veckans djupdykning", icon: TrendingDown, tone: "text-danger from-danger/25", verb: (d) => `−${d} placeringar` },
  YOYO: { label: "Veckans jojo", icon: Repeat, tone: "text-gold from-gold/25", verb: (d) => `${d} placeringar upp & ner` },
};

export function AwardCards({
  awards,
}: {
  awards: { id: string; kind: AwardKind; delta: number; user: { name: string; avatar: string } | null }[];
}) {
  const kinds: AwardKind[] = ["ROCKET", "DIVE", "YOYO"];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {kinds.map((k) => {
        const list = awards.filter((a) => a.kind === k);
        const m = META[k];
        return (
          <div key={k} className={`card relative overflow-hidden bg-gradient-to-br ${m.tone} to-transparent p-5`}>
            <m.icon className={`absolute -right-3 -top-3 size-24 opacity-15 ${m.tone.split(" ")[0]}`} aria-hidden />
            <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${m.tone.split(" ")[0]}`}>
              <m.icon className="size-4" /> {m.label}
            </p>
            {list.length ? (
              <div className="mt-4 space-y-2">
                {list.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <Avatar value={a.user?.avatar ?? ""} name={a.user?.name} size={40} />
                    <div>
                      <p className="font-semibold">{a.user?.name}</p>
                      <p className="text-sm text-muted">{m.verb(a.delta)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">Ingen denna uppdatering.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
