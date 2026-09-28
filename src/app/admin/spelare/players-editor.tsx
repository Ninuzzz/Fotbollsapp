"use client";

import { useMemo, useState } from "react";
import { Save, Trash2, User } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { deletePlayer, savePlayer } from "@/app/actions/admin";
import { ImageInput, ResultText, smallInput, useAdminAction } from "../ui";

type P = { id: string; name: string; teamId: string; teamName: string; goals: number; assists: number; photoUrl: string; tipped: number };

function Row({ p }: { p: P }) {
  const [s, setS] = useState(p);
  const { pending, result, run } = useAdminAction();
  const dirty = s.goals !== p.goals || s.assists !== p.assists;
  return (
    <tr className="border-t border-border/70">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt="" className="size-8 rounded-full object-cover" />
          ) : (
            <span className="grid size-8 place-items-center rounded-full bg-surface-3">
              <User className="size-4 text-faint" />
            </span>
          )}
          <span className="font-semibold">{p.name}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-muted">{p.teamName}</td>
      {(["goals", "assists"] as const).map((k) => (
        <td key={k} className="px-1 py-2">
          <input
            type="number"
            min={0}
            value={s[k]}
            onChange={(e) => setS({ ...s, [k]: Math.max(0, Number(e.target.value) || 0) })}
            aria-label={`${p.name} ${k === "goals" ? "mål" : "assist"}`}
            className="min-h-9 w-16 rounded-lg border border-border-strong bg-bg/60 text-center tabular-nums"
          />
        </td>
      ))}
      <td className="px-2 py-2 text-center text-muted">{p.tipped || ""}</td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          {dirty && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => savePlayer({ id: p.id, name: p.name, teamId: p.teamId, goals: s.goals, assists: s.assists, photoUrl: p.photoUrl }))}
              className="grid size-9 cursor-pointer place-items-center rounded-lg bg-gold text-[#1f1800]"
              aria-label="Spara"
            >
              <Save className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => confirm(`Ta bort ${p.name}?`) && run(() => deletePlayer(p.id))}
            className="grid size-9 cursor-pointer place-items-center rounded-lg text-faint hover:text-danger"
            aria-label={`Ta bort ${p.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <ResultText result={result && !result.ok ? result : null} />
      </td>
    </tr>
  );
}

export function PlayersEditor({ players, teams }: { players: P[]; teams: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [n, setN] = useState({ name: "", teamId: teams[0]?.id ?? "", goals: 0, assists: 0, photoUrl: "" });
  const { pending, result, run } = useAdminAction();
  const shown = useMemo(() => players.filter((p) => `${p.name} ${p.teamName}`.toLowerCase().includes(q.toLowerCase())), [players, q]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-4xl">Spelare, mål & assist</h2>
        <p className="text-sm text-muted">
          Uppdateras automatiskt vid varje synk. Här kan du justera manuellt eller lägga till spelare som folk vill tippa.
        </p>
      </div>
      <Card>
        <h3 className="font-display mb-3 text-2xl">Lägg till spelare</h3>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_5rem_5rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => savePlayer(n), () => setN({ ...n, name: "", goals: 0, assists: 0, photoUrl: "" }));
          }}
        >
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Namn</span>
            <input className={smallInput} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} required />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Lag</span>
            <select className={smallInput} value={n.teamId} onChange={(e) => setN({ ...n, teamId: e.target.value })}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Mål</span>
            <input type="number" min={0} className={smallInput} value={n.goals} onChange={(e) => setN({ ...n, goals: Number(e.target.value) || 0 })} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Assist</span>
            <input type="number" min={0} className={smallInput} value={n.assists} onChange={(e) => setN({ ...n, assists: Number(e.target.value) || 0 })} />
          </label>
          <Button type="submit" variant="gold" disabled={pending} className="min-h-10">
            Lägg till
          </Button>
          <div className="sm:col-span-5">
            <ImageInput label="Foto (valfritt)" value={n.photoUrl} onChange={(photoUrl) => setN({ ...n, photoUrl })} />
          </div>
        </form>
        <div className="mt-2">
          <ResultText result={result} />
        </div>
      </Card>

      <input className={smallInput} placeholder="Sök spelare eller lag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök spelare" />
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Spelare</th>
              <th className="px-2 py-2 text-left">Lag</th>
              <th className="px-1 py-2">Mål</th>
              <th className="px-1 py-2">Assist</th>
              <th className="px-2 py-2" title="Antal som tippat spelaren som skytteligavinnare">Tippad</th>
              <th className="px-2 py-2"><span className="sr-only">Åtgärder</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <Row key={`${p.id}-${p.goals}-${p.assists}`} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
