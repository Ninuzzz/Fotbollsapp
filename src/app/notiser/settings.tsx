"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing } from "lucide-react";
import { updatePrefs } from "@/app/actions/profile";
import { Button } from "@/components/ui";

type Prefs = { notifyDeadline: boolean; notifyNews: boolean; notifyResults: boolean; notifyAwards: boolean; notifyChat: boolean };

const OPTIONS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "notifyDeadline", label: "Deadline-påminnelser", hint: "Om du inte lämnat in ditt tips" },
  { key: "notifyResults", label: "Resultat & tabell", hint: "När tipstabellen uppdateras" },
  { key: "notifyAwards", label: "Veckans utmärkelser", hint: "Raket, djupdykning och jojo" },
  { key: "notifyNews", label: "Nyheter", hint: "Nyheter från Anders" },
  { key: "notifyChat", label: "Chatten", hint: "Nya meddelanden (kan bli många)" },
];

function b64ToUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationSettings({ initial, vapidKey }: { initial: Prefs; vapidKey: string | null }) {
  const [prefs, setPrefs] = useState(initial);
  const [, start] = useTransition();
  const [push, setPush] = useState<"unsupported" | "denied" | "off" | "on" | "loading">("loading");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) return setPush("unsupported");
    if (Notification.permission === "denied") return setPush("denied");
    navigator.serviceWorker.ready.then(async (reg) => setPush((await reg.pushManager.getSubscription()) ? "on" : "off"));
  }, [vapidKey]);

  const toggle = (k: keyof Prefs) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    start(() => updatePrefs(next).then(() => undefined));
  };

  const enable = async () => {
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(vapidKey!) });
      const res = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setPush("on");
      setMsg("Pushnotiser är på för den här enheten.");
    } catch {
      setMsg("Kunde inte aktivera push. På iPhone måste appen först läggas till på hemskärmen.");
    }
  };

  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setPush("off");
  };

  return (
    <div className="card sticky top-20 space-y-5 p-5">
      <div>
        <h2 className="font-display text-3xl">Inställningar</h2>
        <p className="text-sm text-muted">Välj vilka notiser du vill ha. Allt sparas även här i inkorgen.</p>
      </div>
      <div className="rounded-xl border border-border bg-bg/40 p-4">
        {push === "on" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 font-semibold text-pitch">
              <BellRing className="size-5" /> Push är på
            </p>
            <Button variant="outline" className="w-full" onClick={disable}>
              Stäng av på den här enheten
            </Button>
          </div>
        ) : push === "unsupported" ? (
          <p className="text-sm text-muted">
            {vapidKey ? "Din webbläsare stöder inte pushnotiser." : "Pushnotiser är inte konfigurerade på servern ännu (VAPID-nycklar saknas)."}
          </p>
        ) : push === "denied" ? (
          <p className="flex items-start gap-2 text-sm text-muted">
            <BellOff className="mt-0.5 size-4 shrink-0" /> Du har blockerat notiser. Tillåt dem i webbläsarens inställningar för den här sidan.
          </p>
        ) : (
          <Button variant="gold" className="w-full" onClick={enable} disabled={push === "loading"}>
            <BellRing className="size-4" /> Aktivera pushnotiser
          </Button>
        )}
        {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
      </div>
      <ul className="space-y-1">
        {OPTIONS.map((o) => (
          <li key={o.key}>
            <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl px-2 hover:bg-surface-3">
              <span>
                <span className="block font-semibold">{o.label}</span>
                <span className="block text-xs text-muted">{o.hint}</span>
              </span>
              <input type="checkbox" role="switch" checked={prefs[o.key]} onChange={() => toggle(o.key)} className="peer sr-only" />
              <span
                aria-hidden
                className="relative h-7 w-12 shrink-0 rounded-full bg-surface-3 transition after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-muted after:transition peer-checked:bg-pitch peer-checked:after:translate-x-5 peer-checked:after:bg-white peer-focus-visible:outline-2 peer-focus-visible:outline-gold"
              />
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
