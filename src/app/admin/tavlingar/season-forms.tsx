"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { activateSeason, archiveSeason, finishSeason, saveSeason } from "@/app/actions/admin";
import { ActionButton, ResultText, smallInput, useAdminAction } from "../ui";

type S = {
  id: string;
  name: string;
  year: number;
  startDate: string;
  registrationDeadline: string;
  editDeadline: string;
  entryFee: number;
  swishNumber: string;
  reservedAmount: number;
  prizeSplit: string;
  totalRounds: number;
  isActive: boolean;
  isFinished: boolean;
  teams: number;
  entries: number;
  /** När slutresultatet fastställdes (avslutade säsonger) */
  finalAt: string | null;
};

function Form({ initial, seasons, onDone }: { initial: Partial<S>; seasons: S[]; onDone?: () => void }) {
  const [f, setF] = useState({ copyTeamsFrom: initial.id ? "" : seasons[0]?.id ?? "", ...initial });
  const { pending, result, run } = useAdminAction();
  const input = (k: keyof S, label: string, type = "text") => (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted">{label}</span>
      <input type={type} className={smallInput} value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSeason(f as Parameters<typeof saveSeason>[0]), onDone);
      }}
    >
      {input("name", "Namn (t.ex. Tips Allsvenskan 2027)")}
      {input("year", "År", "number")}
      {input("totalRounds", "Antal omgångar", "number")}
      {input("startDate", "Seriestart", "datetime-local")}
      {input("registrationDeadline", "Sista anmälningsdag", "datetime-local")}
      {input("editDeadline", "Sista dag att ändra tips", "datetime-local")}
      {input("entryFee", "Insats (kr)", "number")}
      {input("swishNumber", "Swish-nummer")}
      {input("reservedAmount", "Avsatt till mugg/tröstpris (kr)", "number")}
      {input("prizeSplit", "Prisfördelning i % (t.ex. 50,30,20)")}
      {!initial.id && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted">Återanvänd lag från</span>
          <select className={smallInput} value={f.copyTeamsFrom} onChange={(e) => setF({ ...f, copyTeamsFrom: e.target.value })}>
            <option value="">Inga (välj lag själv)</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.teams} lag)
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
        <Button type="submit" variant="gold" disabled={pending}>
          {initial.id ? "Spara ändringar" : "Skapa tävling"}
        </Button>
        <ResultText result={result} />
      </div>
    </form>
  );
}

export function SeasonForms({ seasons }: { seasons: S[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const next = (seasons[0]?.year ?? new Date().getFullYear()) + 1;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-4xl">Tävlingar</h2>
        <Button variant="gold" onClick={() => setCreating((v) => !v)}>
          <Plus className="size-4" /> Ny tävling
        </Button>
      </div>
      {creating && (
        <Card>
          <h3 className="font-display mb-4 text-2xl">Ny tävling</h3>
          <Form
            seasons={seasons}
            onDone={() => setCreating(false)}
            initial={{
              name: `Tips Allsvenskan ${next}`,
              year: next,
              totalRounds: 30,
              startDate: `${next}-04-05T15:00`,
              registrationDeadline: `${next}-04-03T23:59`,
              editDeadline: `${next}-04-03T23:59`,
              entryFee: seasons[0]?.entryFee ?? 111,
              swishNumber: seasons[0]?.swishNumber ?? "0733-364314",
              reservedAmount: seasons[0]?.reservedAmount ?? 600,
              prizeSplit: seasons[0]?.prizeSplit ?? "50,30,20",
            }}
          />
        </Card>
      )}
      {seasons.map((s) => (
        <Card key={s.id}>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-display text-3xl">{s.name}</h3>
            {s.isActive && <Badge tone="pitch">Aktiv</Badge>}
            {s.isFinished && <Badge>Avslutad</Badge>}
            <span className="text-sm text-muted">
              {s.teams} lag · {s.entries} deltagare
              {s.finalAt ? ` · slutresultat fastställt ${new Date(s.finalAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" })}` : ""}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(editing === s.id ? null : s.id)}>
              {editing === s.id ? "Stäng" : "Redigera datum & pott"}
            </Button>
            {!s.isActive && <ActionButton action={activateSeason.bind(null, s.id)}>Gör aktiv</ActionButton>}
            <ActionButton
              action={finishSeason.bind(null, s.id, !s.isFinished, false)}
              confirm={
                s.isFinished
                  ? "Öppna säsongen igen? Tabell, spelare och betalningar kan då ändras. Avslutar du den igen och prislistan har ändrats skickas en rättelse till alla."
                  : "Avsluta säsongen? Slutresultatet fastställs och prislistan skickas till alla. Kontrollera först skytte- och assistligan mot allsvenskan.se. Säsongen kräver att alla lag har spelat klart."
              }
            >
              {s.isFinished ? "Öppna igen" : "Avsluta säsong"}
            </ActionButton>
            {!s.isFinished && (
              <ActionButton
                action={finishSeason.bind(null, s.id, true, true)}
                variant="danger"
                confirm="Avsluta ÄNDÅ, trots att inte alla lag har spelat klart? Gör bara det om du har kontrollerat slutställningen och skytte-/assistligan på allsvenskan.se. Prislistan skickas till alla direkt."
              >
                Avsluta ändå…
              </ActionButton>
            )}
            {s.isFinished && (
              <ActionButton action={archiveSeason.bind(null, s.id)} confirm="Spara slutresultatet i historiken (Heroes / all-time)?">
                Arkivera till historiken
              </ActionButton>
            )}
          </div>
          {editing === s.id && (
            <div className="mt-5 border-t border-border pt-5">
              <Form initial={s} seasons={seasons} onDone={() => setEditing(null)} />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
