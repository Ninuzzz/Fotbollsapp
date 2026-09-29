"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { sendAdminNotification } from "@/app/actions/admin";
import { ImageInput, ResultText, smallInput, useAdminAction } from "../ui";

const EMPTY = { type: "NEWS" as const, audience: "ALL" as const, title: "", body: "", imageUrl: "", link: "" };

export function Composer() {
  const [f, setF] = useState<{ type: "NEWS" | "GENERAL" | "DEADLINE" | "RESULTS"; audience: "ALL" | "PAID" | "MISSING_TIPS"; title: string; body: string; imageUrl: string; link: string }>(EMPTY);
  const { pending, result, run } = useAdminAction();
  return (
    <Card>
      <h3 className="font-display mb-4 text-2xl">Nytt utskick</h3>
      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirm(`Skicka "${f.title}" till ${f.audience === "ALL" ? "alla" : f.audience === "PAID" ? "betalande" : "de som saknar tips"}?`)) return;
          run(() => sendAdminNotification(f), () => setF(EMPTY));
        }}
      >
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Typ</span>
          <select className={smallInput} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
            <option value="NEWS">Nyhet</option>
            <option value="GENERAL">Allmänt (går alltid ut)</option>
            <option value="RESULTS">Resultat</option>
            <option value="DEADLINE">Deadline</option>
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Mottagare</span>
          <select className={smallInput} value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as typeof f.audience })}>
            <option value="ALL">Alla</option>
            <option value="PAID">Betalande spelare</option>
            <option value="MISSING_TIPS">De som inte lämnat in tips</option>
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-muted">Rubrik</span>
          <input className={smallInput} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={120} required />
        </label>
        <label className="md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-muted">Text</span>
          <textarea className={`${smallInput} min-h-32 py-2`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} maxLength={4000} required />
        </label>
        <ImageInput label="Bild (valfri)" value={f.imageUrl} onChange={(imageUrl) => setF({ ...f, imageUrl })} />
        <label>
          <span className="mb-1 block text-xs font-semibold text-muted">Länk vid klick (valfri)</span>
          <input className={smallInput} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="/tipstabell eller https://…" />
        </label>
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" variant="gold" disabled={pending}>
            <Send className="size-4" /> {pending ? "Skickar…" : "Publicera & skicka"}
          </Button>
          <ResultText result={result} />
        </div>
      </form>
    </Card>
  );
}
