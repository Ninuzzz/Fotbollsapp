"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = parts(new Date(to).getTime() - (now ?? Date.now()));
  return (
    <div className="flex gap-2" role="timer" aria-live="off" aria-label={`${p.d} dagar, ${p.h} timmar och ${p.m} minuter kvar`}>
      {[
        [p.d, "dagar"],
        [p.h, "tim"],
        [p.m, "min"],
        [p.s, "sek"],
      ].map(([v, l]) => (
        <div key={l} className="card min-w-16 px-3 py-2 text-center">
          <p className="font-display text-4xl tabular-nums">{now === null ? "–" : String(v).padStart(2, "0")}</p>
          <p className="text-[11px] uppercase tracking-widest text-muted">{l}</p>
        </div>
      ))}
    </div>
  );
}
