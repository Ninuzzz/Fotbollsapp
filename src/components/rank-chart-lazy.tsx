"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { RankChart as Chart } from "./charts";

/**
 * Recharts är ~110 kB JavaScript. Grafen laddas därför först efter att sidan har visats,
 * och en platshållare med samma höjd hindrar att innehållet hoppar.
 */
const Lazy = dynamic(() => import("./charts").then((m) => m.RankChart), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse rounded-xl bg-surface-2/50" />,
});

export function RankChart(props: ComponentProps<typeof Chart>) {
  return (
    <div style={{ height: props.height ?? 340 }}>
      <Lazy {...props} />
    </div>
  );
}
