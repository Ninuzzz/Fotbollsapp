"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Kategoriska färger – valda för att skiljas åt mot mörk bakgrund (och inte bara via färg: linjer har olika streck)
const PALETTE = ["#f5c518", "#22c55e", "#38bdf8", "#f472b6", "#a78bfa", "#fb923c", "#2dd4bf", "#f87171", "#e2e8f0", "#84cc16"];
const DASH = ["", "6 3", "2 3", "10 4", "4 2 1 2", "", "6 3", "2 3", "10 4", ""];

export type Series = { id: string; name: string; highlight?: boolean };

/** Placering över tid – lägre är bättre, så y-axeln är inverterad */
export function RankChart({
  data,
  series,
  metric = "rank",
  height = 340,
  maxRank,
}: {
  data: Record<string, number | null>[];
  series: Series[];
  metric?: "rank" | "errors";
  height?: number;
  maxRank?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={metric === "rank" ? "Graf över placering per omgång" : "Graf över antal fel per omgång"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#1f3a2d" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="round" stroke="#6b8579" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} label={{ value: "Omgång", position: "insideBottomRight", offset: -2, fill: "#6b8579", fontSize: 11 }} />
          <YAxis
            reversed={metric === "rank"}
            allowDecimals={false}
            domain={metric === "rank" ? [1, maxRank ?? "dataMax"] : ["dataMin - 2", "dataMax + 2"]}
            stroke="#6b8579"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ background: "#0b1611", border: "1px solid #2d5240", borderRadius: 12, color: "#ecf6f0" }}
            labelFormatter={(l) => `Omgång ${l}`}
            formatter={(v, name) => [metric === "rank" ? `${v}:a` : `${v} fel`, name]}
            itemSorter={(i) => Number(i.value)}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              name={s.name}
              stroke={PALETTE[i % PALETTE.length]}
              strokeDasharray={DASH[i % DASH.length]}
              strokeWidth={s.highlight ? 3.5 : 2}
              dot={false}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive
              animationDuration={900}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
