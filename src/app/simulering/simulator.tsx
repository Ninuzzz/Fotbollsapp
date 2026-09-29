"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  AlertTriangle,
  Bell,
  Dices,
  FastForward,
  FlaskConical,
  Pause,
  PenLine,
  Play,
  RotateCcw,
  Shuffle,
  SkipForward,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { botTippers, createRng, simulateSeason, type SimPlayer, type SimResult, type SimTeam, type SimTipper } from "@/lib/simulation";
import { distributePrizes, lastPlace } from "@/lib/prizes";
import { TeamCrest } from "@/components/team-crest";
import { SortableRow, type Row } from "@/components/tip-row";
import { validateTip } from "@/lib/tip-validation";
import { Avatar } from "@/components/avatar";
import { RankMove } from "@/components/rank-move";
import { RankChart } from "@/components/rank-chart-lazy";
import { AwardCards } from "@/components/awards";
import { Badge, Button, Field, inputClass } from "@/components/ui";

type Economy = { entryFee: number; reservedAmount: number; split: number[] };
const SPEEDS = [
  { ms: 1400, label: "1×" },
  { ms: 700, label: "2×" },
  { ms: 300, label: "4×" },
];
const DECIDED: Record<string, string> = {
  scorer: "Avgjort på skytteligan",
  assist: "Avgjort på assistligan",
  exact: "Avgjort på exakta placeringar",
  shared: "Delad placering",
};
const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;

export function Simulator({ teams, players, you, economy }: { teams: SimTeam[]; players: SimPlayer[]; you: { name: string; avatar: string }; economy: Economy }) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  // ── Inställningar
  // Som i det riktiga tipset: 16 tomma platser där man väljer lag (eller autofyller)
  const [rows, setRows] = useState<Row[]>(() => teams.map((_, i) => ({ key: `r${i}`, teamId: null })));
  const order = rows.map((r) => r.teamId ?? "");
  const [scorerId, setScorerId] = useState<string | null>(null);
  const [assistId, setAssistId] = useState<string | null>(null);
  const [opponents, setOpponents] = useState(12);
  const [chaos, setChaos] = useState(0.35);
  const [seed, setSeed] = useState(2026);

  // ── Uppspelning
  const [sim, setSim] = useState<{ result: SimResult; tippers: SimTipper[] } | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0);
  const last = (sim?.result.rounds.length ?? 1) - 1;

  const start = () => {
    const rng = createRng(seed * 7919 + 13);
    const tippers: SimTipper[] = [
      { id: "you", name: you.name, avatar: you.avatar, isYou: true, order, scorerId, assistId },
      ...botTippers(opponents, teams.map((t) => t.id), players, rng),
    ];
    const result = simulateSeason({ seed, teams, players, tippers, chaos, ...economy });
    setSim({ result, tippers });
    setIdx(0);
    setPlaying(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (!playing || !sim) return;
    if (idx >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => Math.min(last, i + 1)), SPEEDS[speed]!.ms);
    return () => clearTimeout(t);
  }, [playing, idx, last, speed, sim]);

  // Tangentbord: mellanslag = spela/pausa, pil höger = nästa omgång
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!sim || (e.target as HTMLElement)?.closest("input, select, textarea, button")) return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") setIdx((i) => Math.min(last, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    },
    [sim, last],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  if (!sim) {
    return (
      <Setup
        {...{ teams, players, teamById, rows, setRows, scorerId, setScorerId, assistId, setAssistId, opponents, setOpponents, chaos, setChaos, seed, setSeed }}
        onStart={start}
      />
    );
  }

  const { result, tippers } = sim;
  const round = result.rounds[idx]!;
  const tipperById = new Map(tippers.map((t) => [t.id, t]));
  const me = round.ranking.find((r) => r.id === "you")!;
  const payoutsNow = distributePrizes(round.ranking, result.pool, economy.split);
  const losersNow = lastPlace(round.ranking);
  const myPayout = payoutsNow.find((p) => p.id === "you");
  const finished = idx === last;
  const myTip = new Map(order.map((id, i) => [id, i + 1]));
  const top3 = round.ranking.filter((r) => r.id !== "you").slice(0, 3);
  const chartData = result.rounds.slice(0, idx + 1).map((r) => ({
    round: r.round,
    ...Object.fromEntries(r.ranking.filter((x) => x.id === "you" || top3.some((t) => t.id === x.id)).map((x) => [x.id, x.rank])),
  }));
  const move = me.previousRank === null ? 0 : me.previousRank - me.rank;
  const push =
    idx > 0
      ? move >= 3
        ? `🚀 Du klättrade ${move} placeringar till ${me.rank}:a plats!`
        : move <= -3
          ? `📉 Aj! Du tappade ${-move} placeringar och ligger ${me.rank}:a.`
          : me.rank === 1 && me.previousRank !== 1
            ? "👑 Du leder tipset!"
            : null
      : null;

  return (
    <div className="space-y-8">
      {/* Kontroller */}
      <div className="card sticky top-[4.5rem] z-30 flex flex-wrap items-center gap-2 bg-surface/95 p-3 backdrop-blur" role="toolbar" aria-label="Uppspelning">
        <div className="mr-auto min-w-40">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">
            Omgång <span className="text-text">{round.round}</span> av {last + 1}
          </p>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div className="h-full rounded-full bg-gold transition-[width] duration-300" style={{ width: `${((idx + 1) / (last + 1)) * 100}%` }} />
          </div>
        </div>
        <Button variant="ghost" onClick={() => { setIdx(0); setPlaying(false); }} aria-label="Till omgång 1" className="px-3">
          <RotateCcw className="size-4" />
        </Button>
        <Button variant="gold" onClick={() => (finished ? (setIdx(0), setPlaying(true)) : setPlaying((p) => !p))} aria-label={playing ? "Pausa" : "Spela"} className="px-4">
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          <span className="hidden sm:inline">{playing ? "Pausa" : finished ? "Spela igen" : "Spela"}</span>
        </Button>
        <Button variant="outline" onClick={() => { setPlaying(false); setIdx((i) => Math.min(last, i + 1)); }} disabled={finished} aria-label="Nästa omgång" className="px-3">
          <SkipForward className="size-4" />
        </Button>
        <Button variant="outline" onClick={() => { setPlaying(false); setIdx(last); }} disabled={finished} aria-label="Hoppa till slutet" className="px-3">
          <FastForward className="size-4" />
        </Button>
        <Button variant="ghost" onClick={() => setSpeed((s) => (s + 1) % SPEEDS.length)} aria-label={`Hastighet ${SPEEDS[speed]!.label}`} className="px-3 tabular-nums">
          <Zap className="size-4" /> {SPEEDS[speed]!.label}
        </Button>
        <Button variant="ghost" onClick={() => { setSim(null); setPlaying(false); }} className="px-3">
          <PenLine className="size-4" /> <span className="hidden sm:inline">Ändra tips</span>
        </Button>
      </div>

      {/* Fejkad pushnotis – så här skulle det se ut i telefonen */}
      <div className="pointer-events-none fixed inset-x-0 top-20 z-40 flex justify-center px-4" aria-live="polite">
        <AnimatePresence>
          {push && (
            <motion.div
              key={`${idx}-${push}`}
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              className="flex w-full max-w-sm items-start gap-3 rounded-2xl border border-border-strong bg-surface-2/95 p-3 shadow-2xl backdrop-blur"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-gold text-[#1f1800]">
                <Bell className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted">Allsvenskantipset · pushnotis</p>
                <p className="text-sm font-semibold">{push}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Du */}
      <section className="card grid grid-cols-2 overflow-hidden sm:grid-cols-4 [&>div]:border-border/70 [&>div]:p-5" aria-label="Din placering">
        <div className="border-b border-r sm:border-b-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Din placering</p>
          <p className="font-display mt-2 flex items-baseline gap-3 text-6xl text-gold">
            {me.rank}
            <span className="text-2xl">
              <RankMove previous={me.previousRank} current={me.rank} />
            </span>
          </p>
          <p className="mt-1 text-sm text-muted">av {tippers.length} tippare</p>
        </div>
        <div className="border-b sm:border-b-0 sm:border-r">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Antal fel</p>
          <p className="font-display mt-2 text-6xl text-danger">{me.errors}</p>
          <p className="mt-1 text-sm text-muted">ledaren har {round.ranking[0]!.errors}</p>
        </div>
        <div className="border-r">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Exakt rätt</p>
          <p className="font-display mt-2 text-6xl text-pitch">{me.exact}</p>
          <p className="mt-1 text-sm text-muted">lag på rätt plats</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">{finished ? "Du vinner" : "Om det slutade nu"}</p>
          <p className="font-display mt-2 text-5xl">{myPayout ? kr(myPayout.amount) : losersNow.includes("you") ? "Gratis" : "–"}</p>
          <p className="mt-1 text-sm text-muted">pott {kr(result.pool)}</p>
        </div>
      </section>

      {finished && <Final result={result} tipperById={tipperById} />}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Tipstabellen */}
        <section aria-labelledby="sim-tips">
          <h2 id="sim-tips" className="font-display mb-3 text-3xl">Tipstabellen</h2>
          <ol className="card divide-y divide-border/60 overflow-hidden p-0">
            {round.ranking.map((r) => {
              const t = tipperById.get(r.id)!;
              const pay = payoutsNow.find((p) => p.id === r.id);
              return (
                <motion.li
                  layout
                  key={r.id}
                  transition={{ type: "spring", stiffness: 380, damping: 36 }}
                  className={`flex items-center gap-3 px-3 py-2 ${t.isYou ? "bg-team/20" : ""}`}
                >
                  <span className={`font-display w-7 text-center text-2xl tabular-nums ${r.rank <= 3 ? "text-gold" : "text-muted"}`}>{r.rank}</span>
                  <span className="w-9">
                    <RankMove previous={r.previousRank} current={r.rank} />
                  </span>
                  <Avatar value={t.avatar} name={t.name} size={28} className="hidden min-[400px]:block" />
                  <span className={`min-w-0 flex-1 truncate ${t.isYou ? "font-bold text-text" : "font-semibold"}`}>
                    {t.isYou ? `${t.name} (du)` : t.name}
                    {r.decidedBy && (
                      <span className="ml-1 text-xs text-muted" title={DECIDED[r.decidedBy]}>
                        *<span className="sr-only">{DECIDED[r.decidedBy]}</span>
                      </span>
                    )}
                  </span>
                  {pay && <span className="whitespace-nowrap text-xs font-semibold text-gold">{kr(pay.amount)}</span>}
                  <span className="font-display w-10 text-right text-2xl text-danger tabular-nums">{r.errors}</span>
                </motion.li>
              );
            })}
          </ol>
          <p className="mt-2 text-xs text-muted">* Lika antal fel: avgjort på skytteligan, assistligan eller exakta placeringar.</p>
        </section>

        {/* Den påhittade Allsvenskan */}
        <section aria-labelledby="sim-liga">
          <h2 id="sim-liga" className="font-display mb-3 text-3xl">Fejk-Allsvenskan</h2>
          <div className="card relative overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2.5 text-left" scope="col">#</th>
                  <th className="px-2 py-2.5 text-left" scope="col">Lag</th>
                  <th className="px-2 py-2.5 text-right" scope="col">P</th>
                  <th className="px-3 py-2.5 text-right" scope="col" title="Ditt tips">Tips</th>
                </tr>
              </thead>
              <tbody>
                {round.standings.map((s) => {
                  const team = teamById.get(s.teamId)!;
                  const tip = myTip.get(s.teamId)!;
                  const diff = Math.abs(tip - s.position);
                  return (
                    <tr key={s.teamId} className="border-t border-border/60">
                      <td className="px-3 py-1.5 font-display text-lg text-muted tabular-nums">{s.position}</td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-2">
                          <TeamCrest team={team} size={20} />
                          <span className="truncate font-semibold">{team.name}</span>
                          <RankMove previous={s.previous} current={s.position} />
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums">{s.points}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${diff === 0 ? "font-bold text-pitch" : diff <= 2 ? "text-gold" : "text-danger"}`}>
                        {tip}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Omgångens matcher */}
      <section aria-labelledby="sim-matcher">
        <h2 id="sim-matcher" className="font-display mb-3 text-3xl">Omgång {round.round}</h2>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {round.matches.map((m) => {
            const h = teamById.get(m.home)!;
            const a = teamById.get(m.away)!;
            return (
              <li key={m.home} className={`card flex items-center gap-2 px-3 py-2 text-sm ${m.upset ? "border-gold/60" : ""}`}>
                <TeamCrest team={h} size={18} />
                <span className="min-w-0 flex-1 truncate">{h.shortName}</span>
                <span className="font-display text-xl tabular-nums">
                  {m.hg}–{m.ag}
                </span>
                <span className="min-w-0 flex-1 truncate text-right">{a.shortName}</span>
                <TeamCrest team={a} size={18} />
                {m.upset && <Badge tone="gold">Skräll</Badge>}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Utmärkelser */}
      <section aria-labelledby="sim-awards">
        <h2 id="sim-awards" className="font-display mb-3 text-3xl">Veckans utmärkelser</h2>
        <AwardCards
          awards={round.awards.flatMap((aw) =>
            aw.entryIds.map((id) => {
              const t = tipperById.get(id)!;
              return { id: `${aw.kind}-${id}`, kind: aw.kind, delta: aw.delta, user: { name: t.isYou ? `${t.name} (du)` : t.name, avatar: t.avatar } };
            }),
          )}
        />
      </section>

      {/* Resan */}
      <section aria-labelledby="sim-chart">
        <h2 id="sim-chart" className="font-display mb-3 text-3xl">Din resa mot toppen</h2>
        <div className="card p-3 md:p-5">
          <RankChart
            data={chartData}
            maxRank={tippers.length}
            series={[
              { id: "you", name: `${you.name} (du)`, highlight: true },
              ...top3.map((t) => ({ id: t.id, name: tipperById.get(t.id)!.name })),
            ]}
          />
        </div>
        <p className="mt-2 text-xs text-muted">Tips: mellanslag spelar/pausar, piltangenterna stegar mellan omgångarna.</p>
      </section>
    </div>
  );
}

function Final({ result, tipperById }: { result: SimResult; tipperById: Map<string, SimTipper> }) {
  const me = result.rounds.at(-1)!.ranking.find((r) => r.id === "you")!;
  const mine = result.payouts.find((p) => p.id === "you");
  return (
    <motion.section initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card glow-gold p-6 text-center md:p-8" aria-live="polite">
      <Trophy className="mx-auto size-10 text-gold" />
      <h2 className="font-display mt-3 text-4xl md:text-5xl">
        {me.rank === 1 ? "Du vann tipset!" : mine ? `Du slutade ${me.rank}:a` : `Säsongen är slut, du blev ${me.rank}:a`}
      </h2>
      <p className="mt-2 text-muted">
        {me.errors} fel och {me.exact} exakta. {mine ? `Du tar hem ${kr(mine.amount)}${me.rank === 1 ? ", muggen och ditt namn på vandringspriset" : ""}.` : result.losers.includes("you") ? "Sistaplatsen ger gratis medverkan nästa år." : "Utanför prisplats den här gången."}
      </p>
      <ul className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
        {result.payouts.map((p) => (
          <li key={p.id} className="rounded-xl bg-bg/50 px-3 py-2 text-sm">
            <span className="font-display mr-2 text-xl text-gold">{p.rank}:a</span>
            {tipperById.get(p.id)!.name} · {kr(p.amount)}
            {p.shared > 1 && <span className="text-muted"> (delad)</span>}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

/* ───────────────────────── Inställningar ───────────────────────── */

function Setup(props: {
  teams: SimTeam[];
  players: SimPlayer[];
  teamById: Map<string, SimTeam>;
  rows: Row[];
  setRows: (r: Row[]) => void;
  scorerId: string | null;
  setScorerId: (v: string | null) => void;
  assistId: string | null;
  setAssistId: (v: string | null) => void;
  opponents: number;
  setOpponents: (v: number) => void;
  chaos: number;
  setChaos: (v: number) => void;
  seed: number;
  setSeed: (v: number) => void;
  onStart: () => void;
}) {
  const { teams, players, teamById, rows, setRows } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const validation = validateTip(rows.map((r) => r.teamId), teams.map((t) => t.id));
  const dup = new Set(validation.duplicates);
  const stamp = () => Date.now().toString(36);
  const fill = (ids: string[]) => setRows(ids.map((teamId, i) => ({ key: `f${i}-${stamp()}`, teamId })));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setRows(arrayMove(rows, rows.findIndex((r) => r.key === e.active.id), rows.findIndex((r) => r.key === e.over!.id)));
  };
  // Autofyll: behåller det du redan valt och fyller tomma platser med resterande lag i tabellordning
  const autofill = () => {
    const used = new Set(rows.map((r) => r.teamId).filter(Boolean));
    const rest = teams.map((t) => t.id).filter((id) => !used.has(id));
    const seen = new Set<string>();
    setRows(
      rows.map((r) => {
        if (r.teamId && !seen.has(r.teamId)) {
          seen.add(r.teamId);
          return r;
        }
        return { ...r, teamId: rest.shift() ?? null };
      }),
    );
  };
  const shuffle = () => {
    const rng = createRng(Date.now() % 100000);
    fill(teams.map((t) => ({ id: t.id, k: rng() })).sort((a, b) => a.k - b.k).map((x) => x.id));
  };
  const chaosLabel = props.chaos < 0.2 ? "Favoriterna vinner" : props.chaos < 0.5 ? "Som vanligt" : props.chaos < 0.8 ? "Skrällvarning" : "Rena lotteriet";
  const placed = 16 - validation.empty.length - validation.duplicates.length;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section aria-labelledby="sim-tip">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="sim-tip" className="font-display text-3xl">Ditt fejktips</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={autofill} className="min-h-10 px-3 text-sm">
              <Sparkles className="size-4" /> Autofyll
            </Button>
            <Button variant="ghost" onClick={shuffle} className="min-h-10 px-3 text-sm">
              <Shuffle className="size-4" /> Slumpa
            </Button>
            <Button variant="ghost" onClick={() => setRows(rows.map((r, i) => ({ key: `e${i}-${stamp()}`, teamId: null })))} className="min-h-10 px-3 text-sm">
              <RotateCcw className="size-4" /> Rensa
            </Button>
          </div>
        </div>

        {!validation.ok && (
          <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-dim/40 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <div>
              {validation.duplicates.length > 0 && <p className="font-semibold text-danger">Samma lag förekommer flera gånger (rött).</p>}
              {validation.missing.length > 0 && <p className="text-muted">Saknas: {validation.missing.map((id) => teamById.get(id)?.name).join(", ")}</p>}
            </div>
          </div>
        )}

        <DndContext id="sim-tip-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
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
                  locked={false}
                  onPick={(teamId) => setRows(rows.map((r, j) => (j === i ? { ...r, teamId } : r)))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
        <p className="mt-3 text-xs text-muted">Välj lag i listorna, dra i handtagen, eller tryck Autofyll för att fylla de tomma platserna.</p>
      </section>

      <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
        <div className="card space-y-4 p-5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold">
            <FlaskConical className="size-4" /> Inställningar
          </p>
          <Field label="Skytteligavinnare (utslagsfråga 1)">
            <select className={inputClass} value={props.scorerId ?? ""} onChange={(e) => props.setScorerId(e.target.value || null)}>
              <option value="">Välj spelare…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({teamById.get(p.teamId)?.shortName})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assistkung (utslagsfråga 2)">
            <select className={inputClass} value={props.assistId ?? ""} onChange={(e) => props.setAssistId(e.target.value || null)}>
              <option value="">Välj spelare…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({teamById.get(p.teamId)?.shortName})
                </option>
              ))}
            </select>
          </Field>
          <Field label={`Fejkade motståndare: ${props.opponents}`}>
            <input type="range" min={4} max={20} value={props.opponents} onChange={(e) => props.setOpponents(Number(e.target.value))} className="w-full accent-[var(--gold)]" />
          </Field>
          <Field label={`Skrällnivå: ${chaosLabel}`} hint="Hur ofta underdogs vinner.">
            <input type="range" min={0} max={1} step={0.05} value={props.chaos} onChange={(e) => props.setChaos(Number(e.target.value))} className="w-full accent-[var(--gold)]" />
          </Field>
          <Field label="Slumpfrö" hint="Samma frö ger exakt samma säsong – bra om du vill visa samma demo igen.">
            <div className="flex gap-2">
              <input
                type="number"
                inputMode="numeric"
                className={inputClass}
                value={props.seed}
                onChange={(e) => props.setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              />
              <Button type="button" variant="outline" onClick={() => props.setSeed(Math.floor(Math.random() * 100000))} aria-label="Nytt slumpfrö" className="shrink-0 px-3">
                <Dices className="size-4" />
              </Button>
            </div>
          </Field>
          <Button variant="gold" onClick={props.onStart} disabled={!validation.ok} className="w-full">
            <Play className="size-4" /> Spela säsongen
          </Button>
          {!validation.ok && <p className="text-center text-sm text-muted" aria-live="polite">{placed}/16 lag korrekt placerade</p>}
        </div>
        <p className="px-1 text-sm text-muted">
          Allt räknas i webbläsaren och sparas inte. Det riktiga tipset, tabellen och chatten påverkas inte.
        </p>
      </aside>
    </div>
  );
}
