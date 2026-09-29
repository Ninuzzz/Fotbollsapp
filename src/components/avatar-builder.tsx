"use client";

import { useRef, useState } from "react";
import { ImagePlus, Shirt } from "lucide-react";
import { JERSEY_PATTERNS, jerseyString, parseAvatar, type JerseyAvatar } from "@/lib/avatar";
import { Avatar, Jersey } from "./avatar";

const COLORS = ["#0b0b0b", "#ffffff", "#facc15", "#dc2626", "#1d4ed8", "#38bdf8", "#16a34a", "#15803d", "#7c3aed", "#f97316", "#b91c1c", "#1e3a8a"];

/** Komprimerar en bild till 256×256 JPEG (data-URL) i webbläsaren */
async function toSquareDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const s = Math.min(bmp.width, bmp.height);
  ctx.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.82);
}

export function AvatarBuilder({ value, onChange, name }: { value: string; onChange: (v: string) => void; name?: string }) {
  const parsed = parseAvatar(value);
  const [jersey, setJersey] = useState<Omit<JerseyAvatar, "kind">>(
    parsed.kind === "jersey" ? parsed : { pattern: "solid", color1: "#1d4ed8", color2: "#facc15", number: "10" },
  );
  const [mode, setMode] = useState<"jersey" | "image">(parsed.kind);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<typeof jersey>) => {
    const next = { ...jersey, ...patch };
    setJersey(next);
    onChange(jerseyString(next));
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-full bg-gradient-to-b from-team/40 to-transparent p-2">
          <Avatar value={value} name={name} size={132} />
        </div>
        <div className="flex rounded-xl border border-border p-1" role="group" aria-label="Typ av avatar">
          <button
            type="button"
            aria-pressed={mode === "jersey"}
            onClick={() => {
              setMode("jersey");
              onChange(jerseyString(jersey));
            }}
            className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${mode === "jersey" ? "bg-surface-3" : "text-muted"}`}
          >
            <Shirt className="size-4" /> Tröja
          </button>
          <button
            type="button"
            aria-pressed={mode === "image"}
            onClick={() => file.current?.click()}
            className={`flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${mode === "image" ? "bg-surface-3" : "text-muted"}`}
          >
            <ImagePlus className="size-4" /> Egen bild
          </button>
        </div>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Ladda upp bild"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 8_000_000) return setErr("Bilden är för stor (max 8 MB).");
            try {
              onChange(await toSquareDataUrl(f));
              setMode("image");
              setErr(null);
            } catch {
              setErr("Kunde inte läsa bilden.");
            }
          }}
        />
        {err && <p className="text-sm text-danger">{err}</p>}
      </div>

      {mode === "jersey" && (
        <div className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Mönster</legend>
            <div className="flex flex-wrap gap-2">
              {JERSEY_PATTERNS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => update({ pattern: p.id })}
                  aria-pressed={jersey.pattern === p.id}
                  className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-xs ${
                    jersey.pattern === p.id ? "border-gold bg-surface-3" : "border-border hover:border-border-strong"
                  }`}
                >
                  <Jersey {...jersey} pattern={p.id} size={44} />
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
          {(["color1", "color2"] as const).map((k) => (
            <fieldset key={k}>
              <legend className="mb-2 text-sm font-semibold">{k === "color1" ? "Huvudfärg" : "Detaljfärg"}</legend>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => update({ [k]: c })}
                    aria-label={`Färg ${c}`}
                    aria-pressed={jersey[k] === c}
                    className={`size-10 cursor-pointer rounded-full border-2 transition ${jersey[k] === c ? "scale-110 border-gold" : "border-border"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </fieldset>
          ))}
          <label className="block">
            <span className="mb-2 block text-sm font-semibold">Tröjnummer</span>
            <input
              type="number"
              min={1}
              max={99}
              value={jersey.number}
              onChange={(e) => update({ number: String(Math.max(1, Math.min(99, Number(e.target.value) || 1))) })}
              className="min-h-11 w-24 rounded-xl border border-border-strong bg-bg/60 px-3 text-base"
            />
          </label>
        </div>
      )}
      {mode === "image" && (
        <p className="self-center text-muted">
          Din bild beskärs till en cirkel och visas i tipstabellen. Klicka på Tröja för att byta tillbaka.
        </p>
      )}
    </div>
  );
}
