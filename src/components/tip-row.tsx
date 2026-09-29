"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TeamCrest } from "@/components/team-crest";

type Team = { id: string; name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string };
export type Row = { key: string; teamId: string | null };

/** En plats i tipset: dra i handtaget eller välj lag i listan. Används av både det riktiga tipset och simuleringen. */
export function SortableRow({
  row,
  index,
  teams,
  team,
  duplicate,
  locked,
  onPick,
}: {
  row: Row;
  index: number;
  teams: Team[];
  team?: Team;
  duplicate: boolean;
  locked: boolean;
  onPick: (id: string | null) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key, disabled: locked });
  const pos = index + 1;
  const zone = pos <= 3 ? "text-gold" : pos >= 15 ? "text-danger" : "text-muted";
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors ${
        duplicate ? "border-danger bg-danger-dim/50" : isDragging ? "z-10 border-gold bg-surface-3 shadow-2xl" : "border-border bg-surface-2"
      }`}
    >
      <span className={`font-display w-8 text-center text-2xl tabular-nums ${zone}`}>{pos}</span>
      {!locked && (
        <button
          type="button"
          className="grid size-10 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted hover:bg-surface-3 active:cursor-grabbing"
          aria-label={`Flytta placering ${pos}${team ? `, ${team.name}` : ""}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" />
        </button>
      )}
      <div className="grid size-8 shrink-0 place-items-center">{team && <TeamCrest team={team} size={26} />}</div>
      <label className="sr-only" htmlFor={`pos-${pos}`}>
        Lag på plats {pos}
      </label>
      <select
        id={`pos-${pos}`}
        value={row.teamId ?? ""}
        disabled={locked}
        onChange={(e) => onPick(e.target.value || null)}
        aria-invalid={duplicate}
        className={`min-h-10 w-full min-w-0 flex-1 cursor-pointer rounded-lg border bg-bg/40 px-2 text-base font-semibold disabled:cursor-default disabled:border-transparent disabled:bg-transparent disabled:opacity-100 ${
          duplicate ? "border-danger text-danger" : "border-transparent"
        }`}
      >
        <option value="">Välj lag…</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </li>
  );
}
