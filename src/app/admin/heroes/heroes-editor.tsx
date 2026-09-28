"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { deleteHero, importHistory, saveHero } from "@/app/actions/admin";
import { ActionButton, ImageInput, ResultText, smallInput, useAdminAction } from "../ui";

type H = { id?: string; year: number; name: string; description: string; imageUrl: string; errors: number | null; consent: boolean };

function HeroForm({ hero, onDone }: { hero: H; onDone?: () => void }) {
  const [h, setH] = useState(hero);
  const { pending, result, run } = useAdminAction();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[6rem_1fr_6rem]"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveHero({ ...h, errors: h.errors ?? null }), onDone);
      }}
    >
      <label>
        <span className="mb-1 block text-xs font-semibold text-muted">År</span>
        <input type="number" className={smallInput} value={h.year} onChange={(e) => setH({ ...h, year: Number(e.target.value) })} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold text-muted">Vinnare</span>
        <input className={smallInput} value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} required />
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold text-muted">Antal fel</span>
        <input type="number" className={smallInput} value={h.errors ?? ""} onChange={(e) => setH({ ...h, errors: e.target.value === "" ? null : Number(e.target.value) })} />
      </label>
      <label className="sm:col-span-3">
        <span className="mb-1 block text-xs font-semibold text-muted">Kort beskrivning</span>
        <textarea className={`${smallInput} min-h-20 py-2`} value={h.description} onChange={(e) => setH({ ...h, description: e.target.value })} maxLength={600} />
      </label>
      <div className="sm:col-span-3">
        <ImageInput label="Bild på vinnaren" value={h.imageUrl} onChange={(imageUrl) => setH({ ...h, imageUrl })} />
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm sm:col-span-3">
        <input type="checkbox" checked={h.consent} onChange={(e) => setH({ ...h, consent: e.target.checked })} className="mt-0.5 size-5 accent-[var(--gold)]" />
        <span>
          <strong>Vinnaren har gett samtycke</strong> till att namn och bild visas i Hall of Fame (GDPR). Utan samtycke visas bara årtalet.
        </span>
      </label>
      <div className="flex items-center gap-3 sm:col-span-3">
        <Button type="submit" variant="gold" disabled={pending}>
          Spara
        </Button>
        {h.id && (
          <ActionButton action={deleteHero.bind(null, h.id)} variant="ghost" confirm={`Ta bort ${h.name} (${h.year})?`}>
            Ta bort
          </ActionButton>
        )}
        <ResultText result={result} />
      </div>
    </form>
  );
}

export function HeroesEditor({ heroes, history }: { heroes: H[]; history: { year: number; count: number }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const imp = useAdminAction();
  const next = (heroes[0]?.year ?? new Date().getFullYear() - 1) + 1;
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-4xl">Heroes</h2>
        <Button variant="gold" onClick={() => setOpen(open === "new" ? null : "new")}>
          <Plus className="size-4" /> Ny vinnare
        </Button>
      </div>
      {open === "new" && (
        <Card>
          <HeroForm hero={{ year: next, name: "", description: "", imageUrl: "", errors: null, consent: false }} onDone={() => setOpen(null)} />
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {heroes.map((h) => (
          <Card key={h.id} className="p-4">
            <button type="button" className="flex w-full cursor-pointer items-center gap-3 text-left" onClick={() => setOpen(open === h.id ? null : h.id!)} aria-expanded={open === h.id}>
              {h.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={h.imageUrl} alt="" className="size-12 rounded-xl object-cover" />
              ) : (
                <span className="size-12 rounded-xl bg-surface-3" />
              )}
              <span className="font-display text-3xl text-gold">{h.year}</span>
              <span className="flex-1 font-semibold">{h.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${h.consent ? "bg-pitch/20 text-pitch" : "bg-danger/20 text-danger"}`}>
                {h.consent ? "Samtycke" : "Dolt"}
              </span>
            </button>
            {open === h.id && (
              <div className="mt-4 border-t border-border pt-4">
                <HeroForm hero={h} onDone={() => setOpen(null)} />
              </div>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="font-display text-2xl">Importera historik (all-time-statistik)</h3>
        <p className="mt-1 text-sm text-muted">
          Klistra in slutresultat från tidigare år, en tippare per rad: <code className="rounded bg-bg px-1">År;Namn;Placering;Fel</code>. Tabbar från Excel
          fungerar också. Finns i dag: {history.map((h) => `${h.year} (${h.count} st)`).join(", ") || "inget"}. Avslutade säsonger kan även arkiveras under
          Tävlingar.
        </p>
        <textarea
          className={`${smallInput} mt-3 min-h-40 py-2 font-mono`}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          placeholder={"2023;Helena Arph;1;44\n2023;Svenolof Åsenlund;2;46"}
          aria-label="Historik att importera"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button variant="gold" disabled={imp.pending || !csv.trim()} onClick={() => imp.run(() => importHistory(csv), () => setCsv(""))}>
            Importera
          </Button>
          <ResultText result={imp.result} />
        </div>
      </Card>
    </div>
  );
}
