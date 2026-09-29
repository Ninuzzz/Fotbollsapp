"use client";

import { useMemo, useRef, useState } from "react";
import { Camera, Link2, Save, Trash2, User, X } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { deletePlayer, savePlayer } from "@/app/actions/admin";
import { ImageInput, ResultText, smallInput, useAdminAction } from "../ui";

type P = { id: string; name: string; teamId: string; teamName: string; goals: number; assists: number; photoUrl: string; tipped: number };

/**
 * Gör om en uppladdad bild till ett litet fyrkantigt porträtt (256×256 JPEG, ~20–30 kB).
 * Beskärningen tar den övre delen av stående bilder, där ansiktet brukar sitta.
 */
async function squarePhoto(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Endast PNG, JPEG eller WebP");
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = bmp.height > bmp.width ? (bmp.height - side) * 0.15 : (bmp.height - side) / 2;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  c.getContext("2d")!.drawImage(bmp, sx, sy, side, side, 0, 0, 256, 256);
  return c.toDataURL("image/jpeg", 0.82);
}

function Row({ p }: { p: P }) {
  const [s, setS] = useState(p);
  const [photo, setPhoto] = useState(p.photoUrl);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const { pending, result, run } = useAdminAction();
  const dirty = s.goals !== p.goals || s.assists !== p.assists;

  const save = (photoUrl: string) =>
    run(
      () => savePlayer({ id: p.id, name: p.name, teamId: p.teamId, goals: s.goals, assists: s.assists, photoUrl }),
      () => setPhoto(photoUrl),
    );
  const upload = async (f: File) => {
    try {
      setPhotoErr(null);
      save(await squarePhoto(f));
    } catch (e) {
      setPhotoErr((e as Error).message);
    }
  };
  const pasteUrl = () => {
    const url = prompt(`Bildadress för ${p.name} (https://…)`)?.trim();
    if (!url) return;
    if (!/^https:\/\//.test(url)) return setPhotoErr("Adressen måste börja med https://");
    save(url);
  };

  return (
    <tr className="border-t border-border/70">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => file.current?.click()}
            disabled={pending}
            className="group relative grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full bg-surface-3 ring-1 ring-border-strong hover:ring-gold"
            aria-label={photo ? `Byt bild för ${p.name}` : `Ladda upp bild för ${p.name}`}
            title="Ladda upp bild"
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="size-full object-cover object-top" />
            ) : (
              <User className="size-5 text-faint" />
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/55 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="size-4 text-white" />
            </span>
          </button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void upload(f);
            }}
          />
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.name}</p>
            <div className="flex gap-3 text-xs">
              <button type="button" onClick={pasteUrl} className="inline-flex min-h-6 cursor-pointer items-center gap-1 text-muted hover:text-text">
                <Link2 className="size-3" /> Länk
              </button>
              {photo && (
                <button
                  type="button"
                  onClick={() => confirm(`Ta bort bilden för ${p.name}?`) && save("")}
                  className="inline-flex min-h-6 cursor-pointer items-center gap-1 text-muted hover:text-danger"
                >
                  <X className="size-3" /> Ta bort bild
                </button>
              )}
            </div>
            {photoErr && <p className="text-xs text-danger">{photoErr}</p>}
          </div>
        </div>
      </td>
      <td className="px-2 py-2 text-muted">{p.teamName}</td>
      {(["goals", "assists"] as const).map((k) => (
        <td key={k} className="px-1 py-2">
          <input
            type="number"
            min={0}
            value={s[k]}
            onChange={(e) => setS({ ...s, [k]: Math.max(0, Number(e.target.value) || 0) })}
            aria-label={`${p.name} ${k === "goals" ? "mål" : "assist"}`}
            className="min-h-9 w-16 rounded-lg border border-border-strong bg-bg/60 text-center tabular-nums"
          />
        </td>
      ))}
      <td className="px-2 py-2 text-center text-muted">{p.tipped || ""}</td>
      <td className="px-2 py-2">
        <div className="flex items-center justify-end gap-1">
          {dirty && (
            <button
              type="button"
              disabled={pending}
              onClick={() => save(photo)}
              className="grid size-9 cursor-pointer place-items-center rounded-lg bg-gold text-[#1f1800]"
              aria-label="Spara"
            >
              <Save className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => confirm(`Ta bort ${p.name}?`) && run(() => deletePlayer(p.id))}
            className="grid size-9 cursor-pointer place-items-center rounded-lg text-faint hover:text-danger"
            aria-label={`Ta bort ${p.name}`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
        <ResultText result={result && !result.ok ? result : null} />
      </td>
    </tr>
  );
}

export function PlayersEditor({ players, teams }: { players: P[]; teams: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [n, setN] = useState({ name: "", teamId: teams[0]?.id ?? "", goals: 0, assists: 0, photoUrl: "" });
  const { pending, result, run } = useAdminAction();
  const shown = useMemo(
    () =>
      players.filter(
        (p) => `${p.name} ${p.teamName}`.toLowerCase().includes(q.toLowerCase()) && (!team || p.teamId === team) && (!missingOnly || !p.photoUrl),
      ),
    [players, q, team, missingOnly],
  );
  const missing = players.filter((p) => !p.photoUrl).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-4xl">Spelare, mål & assist</h2>
        <p className="text-sm text-muted">
          Uppdateras automatiskt vid varje synk. Här kan du justera manuellt eller lägga till spelare som folk vill tippa.
        </p>
      </div>
      <Card>
        <h3 className="font-display mb-3 text-2xl">Lägg till spelare</h3>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_5rem_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => savePlayer(n), () => setN({ ...n, name: "", goals: 0, assists: 0, photoUrl: "" }));
          }}
        >
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Namn</span>
            <input className={smallInput} value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} required />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Lag</span>
            <select className={smallInput} value={n.teamId} onChange={(e) => setN({ ...n, teamId: e.target.value })}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Mål</span>
            <input type="number" min={0} className={smallInput} value={n.goals} onChange={(e) => setN({ ...n, goals: Number(e.target.value) || 0 })} />
          </label>
          <label>
            <span className="mb-1 block text-xs font-semibold text-muted">Assist</span>
            <input type="number" min={0} className={smallInput} value={n.assists} onChange={(e) => setN({ ...n, assists: Number(e.target.value) || 0 })} />
          </label>
          <Button type="submit" variant="gold" disabled={pending} className="min-h-10">
            Lägg till
          </Button>
          <div className="sm:col-span-5">
            <ImageInput label="Foto (valfritt)" value={n.photoUrl} onChange={(photoUrl) => setN({ ...n, photoUrl })} />
          </div>
        </form>
        <div className="mt-2">
          <ResultText result={result} />
        </div>
      </Card>

      <div>
        <h3 className="font-display text-2xl">Truppen</h3>
        <p className="text-sm text-muted">
          {missing} av {players.length} spelare saknar bild. Klicka på en spelares bild för att ladda upp en egen – den beskärs och krymps
          automatiskt. Egna bilder skrivs aldrig över av den automatiska synken.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input className={`${smallInput} max-w-xs`} placeholder="Sök spelare eller lag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Sök spelare" />
        <select className={`${smallInput} max-w-xs`} value={team} onChange={(e) => setTeam(e.target.value)} aria-label="Filtrera på lag">
          <option value="">Alla lag</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} className="size-4 accent-[var(--gold)]" />
          Bara spelare utan bild
        </label>
        <span className="text-sm text-muted">{shown.length} visas</span>
      </div>
      <div className="relative overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[600px] text-sm">
          <thead className="bg-surface-2 text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Spelare</th>
              <th className="px-2 py-2 text-left">Lag</th>
              <th className="px-1 py-2">Mål</th>
              <th className="px-1 py-2">Assist</th>
              <th className="px-2 py-2" title="Antal som tippat spelaren som skytteligavinnare">Tippad</th>
              <th className="px-2 py-2"><span className="sr-only">Åtgärder</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <Row key={`${p.id}-${p.goals}-${p.assists}-${p.photoUrl.length}`} p={p} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
