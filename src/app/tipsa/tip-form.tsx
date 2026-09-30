"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AlertTriangle, Check, Lock, RotateCcw, Save, Sparkles, Target } from "lucide-react";
import { saveTip } from "@/app/actions/tips";
import { validateTip } from "@/lib/tip-validation";
import { TeamCrest } from "@/components/team-crest";
import { SortableRow, type Row } from "@/components/tip-row";
import { Badge, Button } from "@/components/ui";
import type { OddsBoard } from "@/lib/odds";

type Team = { id: string; name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string };
type Player = { id: string; name: string; teamName: string; goals: number; assists: number; photoUrl: string | null };

export function TipForm({
  teams,
  players,
  initialOrder,
  initialScorer,
  initialAssist,
  locked: lockedByServer,
  odds,
  showStats,
  year,
  deadline,
  serverNow,
}: {
  teams: Team[];
  players: Player[];
  initialOrder: (string | null)[];
  initialScorer: string | null;
  initialAssist: string | null;
  locked: boolean;
  odds: OddsBoard;
  showStats: boolean;
  year: number;
  /** Sista tidpunkt att spara (ISO) och serverns klocka när sidan renderades – formuläret låses av sig självt vid deadline */
  deadline: string;
  serverNow: number;
}) {
  const [expired, setExpired] = useState(false);
  const locked = lockedByServer || expired;
  useEffect(() => {
    if (lockedByServer) return;
    // Serverns tid, inte webbläsarens: en klocka som går före ska inte låsa formuläret för tidigt
    const offset = serverNow - Date.now();
    const end = new Date(deadline).getTime();
    const t = setInterval(() => Date.now() + offset >= end && setExpired(true), 1000);
    return () => clearInterval(t);
  }, [lockedByServer, serverNow, deadline]);

  const [rows, setRows] = useState<Row[]>(initialOrder.map((teamId, i) => ({ key: `r${i}`, teamId })));
  const [scorer, setScorer] = useState(initialScorer);
  const [assist, setAssist] = useState(initialAssist);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const validation = validateTip(rows.map((r) => r.teamId), teams.map((t) => t.id));
  const dup = new Set(validation.duplicates);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const change = (next: Row[]) => {
    setRows(next);
    setDirty(true);
    setStatus(null);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = rows.findIndex((r) => r.key === e.active.id);
    const to = rows.findIndex((r) => r.key === e.over!.id);
    change(arrayMove(rows, from, to));
  };

  const fillFromOdds = () => {
    const order = odds.rows.map((r) => r.team.id);
    change(order.map((teamId, i) => ({ key: `o${i}-${Date.now()}`, teamId })));
  };

  const save = () =>
    start(async () => {
      const res = await saveTip({ order: rows.map((r) => r.teamId ?? ""), topScorerId: scorer, topAssistId: assist });
      setStatus({ ok: res.ok, text: res.ok ? res.message! : res.error! });
      if (res.ok) setDirty(false);
      // Servern är facit: nekas sparningen för att deadline passerat låses formuläret direkt
      else if (res.locked) setExpired(true);
    });

  const canSave = validation.ok && !locked;
  const byTeam = useMemo(() => {
    const g = new Map<string, Player[]>();
    for (const p of players) g.set(p.teamName, [...(g.get(p.teamName) ?? []), p]);
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [players]);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      {/* TABELLEN */}
      <section aria-labelledby="tabell-rubrik">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="tabell-rubrik" className="font-display text-3xl">
            Sluttabell {year}
          </h2>
          {!locked && (
            <div className="flex gap-2">
              {odds.rows.length > 0 && (
                <Button type="button" variant="outline" onClick={fillFromOdds} className="min-h-10 px-3 text-sm">
                  <Sparkles className="size-4" /> Fyll i enligt oddsen
                </Button>
              )}
              <Button type="button" variant="ghost" onClick={() => change(rows.map((r, i) => ({ key: `e${i}-${Date.now()}`, teamId: null })))} className="min-h-10 px-3 text-sm">
                <RotateCcw className="size-4" /> Rensa
              </Button>
            </div>
          )}
        </div>

        {!validation.ok && !locked && (
          <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-dim/40 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <div>
              {validation.duplicates.length > 0 && <p className="font-semibold text-danger">Samma lag förekommer flera gånger (rött).</p>}
              {validation.missing.length > 0 && (
                <p className="text-muted">
                  Saknas: {validation.missing.map((id) => teamById.get(id)?.name).join(", ")}
                </p>
              )}
            </div>
          </div>
        )}

        <DndContext id="tip-table" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1.5">
              {rows.map((row, i) => (
                <SortableRow
                  key={row.key}
                  row={row}
                  index={i}
                  teams={teams}
                  team={row.teamId ? teamById.get(row.teamId) : undefined}
                  duplicate={dup.has(i)}
                  locked={locked}
                  onPick={(teamId) => change(rows.map((r, j) => (j === i ? { ...r, teamId } : r)))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <p className="mt-3 text-xs text-muted">
          Tips: använd tangentbordet genom att fokusera handtaget, tryck mellanslag och flytta med piltangenterna.
        </p>
      </section>

      {/* UTSLAGSFRÅGOR + ODDS */}
      <aside className="space-y-6">
        <div className="card glow-gold p-5 md:p-6">
          <div className="flex items-center gap-2 text-gold">
            <Target className="size-5" />
            <h2 className="font-display text-3xl">Utslagsfrågorna</h2>
          </div>
          <p className="mt-2 text-sm">
            <strong>Ta ditt val av skytteligavinnare på yttersta allvar!</strong> Vid lika antal fel avgör först hur många mål din skytt gör,
            sedan hur många assist din assistkung gör.
          </p>
          <ul className="mt-3 space-y-1 text-sm text-muted">
            <li>2016: tre tippare på samma poäng (plats 2–4), skytten avgjorde.</li>
            <li>2017: skytten skiljde plats 1 och 2 åt.</li>
            <li>2018: skillnaden mellan plats 2 och 3.</li>
          </ul>
          <div className="mt-5 space-y-4">
            <PlayerSelect label="1. Skytteligavinnare" value={scorer} onChange={(v) => { setScorer(v); setDirty(true); }} groups={byTeam} stat="goals" disabled={locked} showStats={showStats} />
            <PlayerSelect label="2. Assistligavinnare" value={assist} onChange={(v) => { setAssist(v); setDirty(true); }} groups={byTeam} stat="assists" disabled={locked} showStats={showStats} />
          </div>
        </div>

        {odds.rows.length > 0 && (
          <div className="card p-5 md:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-3xl">Spelbolagen tror</h2>
              {odds.isExample && <Badge tone="neutral">Exempeldata</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">Odds på seriesegrare. Procenten är snittet av bolagens sannolikhet, med marginalen borträknad.</p>
            <div className="mt-4 relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="py-2 text-left">Lag</th>
                    {odds.bookmakers.map((b) => (
                      <th key={b} className="px-1 py-2 text-right font-semibold">
                        {b}
                      </th>
                    ))}
                    <th className="py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {odds.rows.map((r) => (
                    <tr key={r.team.id} className="border-t border-border/60">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-right text-muted tabular-nums">{r.marketRank}</span>
                          <TeamCrest team={r.team} size={18} />
                          <span className="truncate">{r.team.shortName}</span>
                        </div>
                      </td>
                      {odds.bookmakers.map((b) => (
                        <td key={b} className="px-1 py-2 text-right tabular-nums">
                          {r.odds[b]?.toFixed(2) ?? "–"}
                        </td>
                      ))}
                      <td className="py-2 text-right font-semibold tabular-nums text-gold">{(r.probability * 100).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </aside>

      {/* Spara – klistrad längst ner */}
      {!locked && (
        <div className="sticky bottom-20 z-40 lg:col-span-2 md:bottom-4">
          <div className="card flex flex-col items-center gap-3 border-border-strong bg-surface/95 p-3 backdrop-blur sm:flex-row sm:justify-between">
            <p className={`text-sm ${status ? (status.ok ? "text-pitch" : "text-danger") : "text-muted"}`} role="status" aria-live="polite">
              {status?.text ??
                (validation.ok
                  ? scorer && assist
                    ? dirty
                      ? "Du har osparade ändringar."
                      : "Allt ifyllt. Glöm inte att spara om du ändrar något."
                    : "Välj skytteligavinnare och assistkung."
                  : `${16 - validation.empty.length - validation.duplicates.length}/16 lag korrekt placerade`)}
            </p>
            <Button type="button" variant="gold" onClick={save} disabled={!canSave || pending} className="w-full sm:w-auto">
              {pending ? "Sparar…" : status?.ok && !dirty ? (<><Check className="size-4" /> Sparat</>) : (<><Save className="size-4" /> Spara tips</>)}
            </Button>
          </div>
        </div>
      )}
      {locked && (
        <p className="flex items-center gap-2 text-sm text-muted lg:col-span-2">
          <Lock className="size-4" /> Tipset är låst efter deadline.
        </p>
      )}
    </div>
  );
}

function PlayerSelect({
  label,
  value,
  onChange,
  groups,
  stat,
  disabled,
  showStats,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  groups: [string, Player[]][];
  stat: "goals" | "assists";
  disabled: boolean;
  showStats: boolean;
}) {
  const id = `ps-${stat}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-11 w-full cursor-pointer rounded-xl border border-border-strong bg-bg/60 px-3 text-base disabled:cursor-default"
      >
        <option value="">Välj spelare…</option>
        {groups.map(([team, ps]) => (
          <optgroup key={team} label={team}>
            {ps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {showStats ? ` (${stat === "goals" ? p.goals + " mål" : p.assists + " assist"})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
