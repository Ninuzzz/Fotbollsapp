"use client";

import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { motion } from "motion/react";
import { Coins, Gift, Star, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { RankMove } from "@/components/rank-move";
import { RankChart } from "@/components/rank-chart-lazy";
import { toggleFollow } from "@/app/actions/social";

type Entry = {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  rank: number;
  previousRank: number | null;
  errors: number;
  exact: number;
  scorer: string;
  assist: string;
  decidedBy: string | null;
  payout: number;
  last: boolean;
};

const DECIDED: Record<string, string> = {
  scorer: "avgjort på skytteligan",
  assist: "avgjort på assistligan",
  exact: "avgjort på exakta",
  shared: "delad placering",
};

type Filter = "all" | "top" | "gang";

export function Leaderboard({
  entries,
  me,
  following,
  history,
  tipsVisible,
}: {
  entries: Entry[];
  me: string | null;
  following: string[];
  history: { round: number; ranks: Record<string, number>; errors: Record<string, number> }[];
  tipsVisible: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [metric, setMetric] = useState<"rank" | "errors">("rank");
  const [optimisticFollowing, setOptimistic] = useOptimistic(following, (state, id: string) =>
    state.includes(id) ? state.filter((x) => x !== id) : [...state, id],
  );
  const [, start] = useTransition();
  const mine = entries.find((e) => e.userId === me);

  const shown = useMemo(() => {
    if (filter === "top") return entries.filter((e) => e.rank <= 10);
    if (filter === "gang") return entries.filter((e) => optimisticFollowing.includes(e.userId) || e.userId === me);
    return entries;
  }, [entries, filter, optimisticFollowing, me]);

  // Graf: jag + mitt gäng, annars topp 5
  const chartEntries = useMemo(() => {
    const gang = entries.filter((e) => optimisticFollowing.includes(e.userId));
    const base = gang.length ? gang : entries.slice(0, 5);
    const list = mine && !base.some((b) => b.id === mine.id) ? [mine, ...base] : base;
    return list.slice(0, 10);
  }, [entries, optimisticFollowing, mine]);

  const chartData = history.map((h) => {
    const row: Record<string, number | null> = { round: h.round };
    for (const e of chartEntries) row[e.id] = (metric === "rank" ? h.ranks[e.id] : h.errors[e.id]) ?? null;
    return row;
  });

  const follow = (userId: string) =>
    start(async () => {
      setOptimistic(userId);
      await toggleFollow(userId);
    });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrera">
        {(
          [
            ["all", "Alla", null],
            ["top", "Toppgänget (topp 10)", null],
            ["gang", `Mitt gäng (${optimisticFollowing.length})`, Users],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
            className={`min-h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold transition ${
              filter === id ? "bg-gold text-[#1f1800]" : "bg-surface-2 text-muted hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {filter === "gang" && optimisticFollowing.length === 0 && (
        <p className="mb-4 text-sm text-muted">
          Tryck på stjärnan vid en tippare för att lägga till hen i ditt gäng. Då syns ni tillsammans i grafen.
        </p>
      )}

      <div className="relative overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-sm sm:min-w-[640px]">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-3 py-3 text-left" scope="col">#</th>
              <th className="px-1 py-3" scope="col"><span className="sr-only">Förändring</span></th>
              <th className="px-2 py-3 text-left" scope="col">Tippare</th>
              <th className="px-2 py-3 text-right" scope="col">Fel</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell" scope="col">Exakta</th>
              <th className="hidden px-2 py-3 text-left md:table-cell" scope="col">Skytt (mål)</th>
              <th className="hidden px-2 py-3 text-left lg:table-cell" scope="col">Assist</th>
              <th className="px-2 py-3 text-right" scope="col">Pris</th>
              {me && <th className="px-2 py-3" scope="col"><span className="sr-only">Följ</span></th>}
            </tr>
          </thead>
          <tbody>
            {!entries.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted">
                  Tipstabellen visas när första omgången är spelad. Fram till dess är allas tips hemliga.
                </td>
              </tr>
            )}
            {shown.map((e, i) => {
              const isMe = e.userId === me;
              const fol = optimisticFollowing.includes(e.userId);
              return (
                <motion.tr
                  key={e.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.015, 0.4) }}
                  className={`border-t border-border/60 ${isMe ? "bg-team/15" : ""}`}
                >
                  <td className={`px-3 py-2.5 font-display text-2xl tabular-nums ${e.rank <= 3 ? "text-gold" : "text-muted"}`}>{e.rank}</td>
                  <td className="w-10 px-1 py-2.5 text-center">
                    <RankMove previous={e.previousRank} current={e.rank} />
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar value={e.avatar} name={e.name} size={34} className="hidden min-[400px]:block" />
                      <div className="min-w-0">
                        {tipsVisible ? (
                          <Link href={`/tippare/${e.id}`} className="font-semibold hover:text-gold hover:underline">
                            {e.name}
                          </Link>
                        ) : (
                          <span className="font-semibold">{e.name}</span>
                        )}
                        {isMe && <span className="ml-2 text-xs font-bold text-team">DU</span>}
                        {e.decidedBy && DECIDED[e.decidedBy] && (
                          <span className="ml-1.5 cursor-help text-xs text-muted" title={DECIDED[e.decidedBy]}>
                            *<span className="sr-only">{DECIDED[e.decidedBy]}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right font-display text-2xl text-danger tabular-nums">{e.errors}</td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums text-pitch sm:table-cell">{e.exact}</td>
                  <td className="hidden px-2 py-2.5 text-muted md:table-cell">{e.scorer}</td>
                  <td className="hidden px-2 py-2.5 text-muted lg:table-cell">{e.assist}</td>
                  <td className="px-2 py-2.5 text-right">
                    {e.payout > 0 ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-gold">
                        <Coins className="hidden size-3.5 sm:block" />
                        {e.payout} kr
                      </span>
                    ) : e.last ? (
                      <span className="inline-flex items-center gap-1 text-xs text-pitch" title="Gratis medverkan nästa år">
                        <Gift className="size-3.5" /> Gratis
                      </span>
                    ) : null}
                  </td>
                  {me && (
                    <td className="px-2 py-2.5 text-right">
                      {!isMe && (
                        <button
                          onClick={() => follow(e.userId)}
                          aria-pressed={fol}
                          aria-label={fol ? `Sluta följa ${e.name}` : `Följ ${e.name}`}
                          className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-surface-3"
                        >
                          <Star className={`size-4 transition ${fol ? "fill-gold text-gold" : "text-faint"}`} />
                        </button>
                      )}
                    </td>
                  )}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        * Lika antal fel: placeringen avgjordes på skytteligan, assistligan eller antal exakta placeringar.
        {!tipsVisible && " Allas tips blir synliga efter deadline, så att ingen kan kopiera."}
      </p>

      <section className="mt-14" id="trender">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-4xl">Trender</h2>
            <p className="text-sm text-muted">
              {optimisticFollowing.length ? "Du och ditt gäng" : me ? "Du och topp 5" : "Topp 5"}, omgång för omgång.
            </p>
          </div>
          <div className="flex rounded-xl border border-border p-1" role="group" aria-label="Mått">
            {(
              [
                ["rank", "Placering"],
                ["errors", "Antal fel"],
              ] as const
            ).map(([id, l]) => (
              <button
                key={id}
                type="button"
                aria-pressed={metric === id}
                onClick={() => setMetric(id)}
                className={`min-h-10 cursor-pointer rounded-lg px-3 text-sm font-semibold ${metric === id ? "bg-surface-3" : "text-muted"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="card p-3 md:p-5">
          <RankChart
            data={chartData}
            metric={metric}
            maxRank={entries.length}
            series={chartEntries.map((e) => ({ id: e.id, name: e.userId === me ? `${e.name} (du)` : e.name, highlight: e.userId === me }))}
            height={380}
          />
        </div>
      </section>
    </>
  );
}
