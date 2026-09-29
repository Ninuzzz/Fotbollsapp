"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { TeamCrest } from "@/components/team-crest";
import { saveTeam } from "@/app/actions/admin";
import { ImageInput, ResultText, smallInput, useAdminAction } from "../ui";

type T = {
  id?: string;
  name: string;
  shortName: string;
  aliases: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string;
  starPlayer: string;
  starPlayerPhoto: string;
  inSeason: boolean;
};

function TeamForm({ team, onDone }: { team: T; onDone?: () => void }) {
  const [t, setT] = useState(team);
  const { pending, result, run } = useAdminAction();
  const text = (k: keyof T, label: string, hint?: string) => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <input className={smallInput} value={String(t[k])} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
      {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveTeam(t), onDone);
      }}
    >
      {text("name", "Namn")}
      {text("shortName", "Förkortning (max 6)")}
      <div className="sm:col-span-2">{text("aliases", "Alias för API-matchning", "Kommaseparerat, t.ex. Djurgarden,Djurgården")}</div>
      <div className="flex gap-4">
        {(["primaryColor", "secondaryColor"] as const).map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">{k === "primaryColor" ? "Huvudfärg" : "Detaljfärg"}</span>
            <input type="color" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} className="h-10 w-16 cursor-pointer rounded-lg border border-border-strong bg-transparent" />
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" checked={t.inSeason} onChange={(e) => setT({ ...t, inSeason: e.target.checked })} className="size-4 accent-[var(--gold)]" />
        Spelar i årets Allsvenska
      </label>
      <ImageInput label="Logotyp (hämtas automatiskt från API)" value={t.logoUrl} onChange={(logoUrl) => setT({ ...t, logoUrl })} />
      <div className="space-y-3">
        {text("starPlayer", "Stjärnspelare (tomt = lagets bästa målskytt)")}
        <ImageInput label="Foto på stjärnspelaren" value={t.starPlayerPhoto} onChange={(starPlayerPhoto) => setT({ ...t, starPlayerPhoto })} />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" variant="gold" disabled={pending}>
          Spara lag
        </Button>
        <ResultText result={result} />
      </div>
    </form>
  );
}

export function TeamsEditor({ teams, seasonName }: { teams: T[]; seasonName: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = teams.filter((t) => t.inSeason).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl">Lagbanken</h2>
          <p className="text-sm text-muted">
            {active} lag i {seasonName}. Lag sparas mellan åren. Bocka i vilka som spelar i år, eller återanvänd hela listan när du skapar en ny tävling.
          </p>
        </div>
        <Button variant="gold" onClick={() => setOpen(open === "new" ? null : "new")}>
          <Plus className="size-4" /> Nytt lag
        </Button>
      </div>
      {open === "new" && (
        <Card>
          <TeamForm
            onDone={() => setOpen(null)}
            team={{ name: "", shortName: "", aliases: "", primaryColor: "#1e3a8a", secondaryColor: "#ffffff", logoUrl: "", starPlayer: "", starPlayerPhoto: "", inSeason: true }}
          />
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {teams.map((t) => (
          <Card key={t.id} className="p-4">
            <button type="button" onClick={() => setOpen(open === t.id ? null : t.id!)} className="flex w-full cursor-pointer items-center gap-3 text-left" aria-expanded={open === t.id}>
              <TeamCrest team={{ ...t, logoUrl: t.logoUrl || null }} size={36} />
              <span className="flex-1 font-semibold">{t.name}</span>
              {t.inSeason ? <Badge tone="pitch">I år</Badge> : <Badge>Vilande</Badge>}
            </button>
            {open === t.id && (
              <div className="mt-4 border-t border-border pt-4">
                <TeamForm team={t} onDone={() => setOpen(null)} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
