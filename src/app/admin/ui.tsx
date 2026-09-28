"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui";

export type ActionResult = { ok: boolean; message?: string; error?: string };

/** Hook: kör en server action, visar resultat och uppdaterar sidan */
export function useAdminAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        setResult(r);
        if (r.ok) {
          onOk?.();
          router.refresh();
        }
      } catch (e) {
        setResult({ ok: false, error: (e as Error).message || "Något gick fel" });
      }
    });
  return { pending, result, run, setResult };
}

export function ResultText({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p role="status" className={`text-sm ${result.ok ? "text-pitch" : "text-danger"}`}>
      {result.ok ? result.message : result.error}
    </p>
  );
}

/** Knapp som kör en action, med valfri bekräftelse */
export function ActionButton({
  action,
  children,
  confirm: confirmText,
  variant = "outline",
  className = "",
}: {
  action: () => Promise<ActionResult>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "gold" | "outline" | "ghost" | "danger";
  className?: string;
}) {
  const { pending, result, run } = useAdminAction();
  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          run(action);
        }}
      >
        {pending ? "Arbetar…" : children}
      </Button>
      <ResultText result={result} />
    </span>
  );
}

/** Bild: URL eller uppladdning (komprimeras i webbläsaren till max 1000 px JPEG) */
export function ImageInput({ value, onChange, label = "Bild" }: { value: string; onChange: (v: string) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (f: File) => {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setErr("Endast PNG, JPEG eller WebP");
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", 0.8);
    if (url.length > 1_000_000) return setErr("Bilden blev för stor, välj en mindre");
    setErr(null);
    onChange(url);
  };
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-16 rounded-xl object-cover" />
        ) : (
          <div className="grid size-16 place-items-center rounded-xl bg-surface-3 text-faint">
            <ImagePlus className="size-6" />
          </div>
        )}
        <div className="flex flex-1 flex-col gap-2">
          <input
            className="min-h-10 w-full rounded-lg border border-border-strong bg-bg/60 px-3 text-sm"
            placeholder="https://… eller ladda upp"
            value={value.startsWith("data:") ? "(uppladdad bild)" : value}
            onChange={(e) => onChange(e.target.value)}
            readOnly={value.startsWith("data:")}
            aria-label={`${label} URL`}
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => ref.current?.click()} className="min-h-9 cursor-pointer rounded-lg bg-surface-3 px-3 text-sm font-semibold hover:brightness-125">
              Ladda upp
            </button>
            {value && (
              <button type="button" onClick={() => onChange("")} className="grid min-h-9 cursor-pointer place-items-center rounded-lg px-2 text-muted hover:text-danger" aria-label="Ta bort bild">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {err && <p className="mt-1 text-sm text-danger">{err}</p>}
    </div>
  );
}

export const smallInput = "min-h-10 w-full rounded-lg border border-border-strong bg-bg/60 px-2.5 text-sm";
