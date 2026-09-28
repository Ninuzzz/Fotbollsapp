import { ArrowDown, ArrowUp, Minus } from "lucide-react";

/** Pil för förändring i placering sedan förra uppdateringen */
export function RankMove({ previous, current }: { previous: number | null; current: number }) {
  if (previous === null) return <span className="text-faint" aria-label="Ny">·</span>;
  const d = previous - current;
  if (d === 0)
    return (
      <span className="inline-flex items-center text-faint" aria-label="Oförändrad">
        <Minus className="size-3.5" />
      </span>
    );
  return d > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-pitch" aria-label={`Upp ${d} placeringar`}>
      <ArrowUp className="size-3.5" />
      {d}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-danger" aria-label={`Ner ${-d} placeringar`}>
      <ArrowDown className="size-3.5" />
      {-d}
    </span>
  );
}
