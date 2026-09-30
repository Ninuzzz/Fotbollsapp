"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui";
import { saveStandings } from "@/app/actions/admin";
import { ResultText, useAdminAction } from "../ui";

type Row = { teamId: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number };
const COLS: [keyof Row, string][] = [
  ["played", "MP"],
  ["won", "V"],
  ["drawn", "O"],
  ["lost", "F"],
  ["goalsFor", "GM"],
  ["goalsAgainst", "IM"],
  ["points", "P"],
];

export function StandingsEditor({ teams, initial }: { teams: { id: string; name: string }[]; initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [notify, setNotify] = useState(true);
  const [force, setForce] = useState(false);
  const { pending, result, run } = useAdminAction();
  const name = new Map(teams.map((t) => [t.id, t.name]));

  const set = (i: number, k: keyof Row, v: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: Math.max(0, Number(v) || 0) } : row)));
  const move = (i: number, d: number) =>
    setRows((r) => {
      const n = [...r];
      const j = i + d;
      if (j < 0 || j >= n.length) return r;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const autoPoints = () => setRows((r) => r.map((x) => ({ ...x, points: x.won * 3 + x.drawn, played: x.won + x.drawn + x.lost })));
  const sort = () =>
    setRows((r) => [...r].sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={autoPoints} className="min-h-10 text-sm">
          Räkna poäng & MP från V/O/F
        </Button>
        <Button variant="outline" onClick={sort} className="min-h-10 text-sm">
          Sortera på poäng/målskillnad
        </Button>
      </div>
      <div className="relative overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-2 py-2 text-left">#</th>
              <th className="px-2 py-2 text-left">Lag</th>
              {COLS.map(([, l]) => (
                <th key={l} className="px-1 py-2">
                  {l}
                </th>
              ))}
              <th className="px-2 py-2"><span className="sr-only">Flytta</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId} className="border-t border-border/70">
                <td className="px-2 py-1.5 font-display text-xl text-muted">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold">{name.get(r.teamId)}</td>
                {COLS.map(([k, l]) => (
                  <td key={k} className="px-1 py-1.5">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={r[k] as number}
                      onChange={(e) => set(i, k, e.target.value)}
                      aria-label={`${name.get(r.teamId)} ${l}`}
                      className="min-h-9 w-14 rounded-lg border border-border-strong bg-bg/60 px-1.5 text-center tabular-nums"
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface-3" aria-label="Flytta upp">
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className="grid size-9 cursor-pointer place-items-center rounded-lg hover:bg-surface-3" aria-label="Flytta ner">
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-[var(--gold)]" />
        Skicka notis om uppdateringen och veckans utmärkelser
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5 size-4 accent-[var(--gold)]" />
        <span>
          Spara ändå, även om kontrollerna anmärker
          <span className="block text-xs text-muted">
            Tabellen kontrolleras innan den sparas (placeringar 1–16, V+O+F = spelade, poäng = 3×V+O, målen går ihop). Bocka i bara om siffrorna stämmer, t.ex. vid poängavdrag.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <Button variant="gold" disabled={pending} onClick={() => run(() => saveStandings({ rows, notify, force }), () => setForce(false))}>
          {pending ? "Sparar…" : "Spara tabell & räkna om"}
        </Button>
        <ResultText result={result} />
      </div>
    </div>
  );
}
