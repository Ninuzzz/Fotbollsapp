"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Clock, Smartphone } from "lucide-react";
import { claimPayment } from "@/app/actions/profile";
import { Button, Field, inputClass } from "./ui";

/** Visas i stället för tipsformulär och chatt tills admin har bekräftat betalningen. */
export function PaymentWaiting({
  status,
  fee,
  swish,
  paidBy,
  context,
}: {
  status: string;
  fee: number;
  swish: string;
  paidBy: string;
  context: "tips" | "chatt";
}) {
  const router = useRouter();
  const [who, setWho] = useState(paidBy);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const claimed = status === "CLAIMED";
  return (
    <div className="card mx-auto max-w-2xl p-6 text-center md:p-10">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-gold/15">
        <Clock className="size-8 text-gold" />
      </div>
      <h2 className="font-display mt-4 text-4xl md:text-5xl">Väntar på betalningsbekräftelse</h2>
      <p className="mx-auto mt-3 max-w-md text-muted">
        {claimed
          ? `Du har meddelat att du swishat. Så snart Anders bekräftat betalningen kan du ${context === "tips" ? "spara ditt tips" : "chatta"} – du får en notis.`
          : `Swisha ${fee} kr till ${swish} och tryck på knappen nedan. När Anders bekräftat betalningen kan du ${context === "tips" ? "spara ditt tips" : "chatta"}.`}
      </p>
      <div className="mx-auto mt-6 inline-flex items-center gap-3 rounded-2xl border border-border bg-bg/50 px-5 py-3">
        <Smartphone className="size-5 text-gold" />
        <span className="font-display text-3xl tracking-wider">{swish}</span>
        <span className="text-muted">· {fee} kr</span>
      </div>
      {!claimed && (
        <div className="mx-auto mt-6 max-w-sm space-y-3 text-left">
          <Field label="Swishat av (om inte du själv)">
            <input className={inputClass} value={who} maxLength={60} onChange={(e) => setWho(e.target.value)} placeholder="Namn eller initialer" />
          </Field>
          <Button
            variant="gold"
            className="w-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await claimPayment({ paidBy: who });
                setMsg(r.ok ? "Tack! Anders har fått en notis." : (r as { error?: string }).error ?? "Något gick fel");
                router.refresh();
              })
            }
          >
            Jag har swishat
          </Button>
        </div>
      )}
      {msg && (
        <p role="status" className="mt-3 text-sm text-pitch">
          {msg}
        </p>
      )}
    </div>
  );
}
