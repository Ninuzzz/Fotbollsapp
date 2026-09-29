"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Download, Gift } from "lucide-react";
import { AvatarBuilder } from "@/components/avatar-builder";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { changePassword, claimPayment, deleteAccount, updateProfile } from "@/app/actions/profile";

type Props = {
  user: { name: string; email: string; avatar: string; favoriteTeamId: string };
  teams: { id: string; name: string }[];
  payment: { status: string; paidBy: string; fee: number; swish: string; season: string } | null;
};

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p role="status" className={`text-sm ${m.ok ? "text-pitch" : "text-danger"}`}>
      {m.text}
    </p>
  );
}

export function ProfileForms({ user, teams, payment }: Props) {
  const router = useRouter();
  const [p, setP] = useState(user);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [paidBy, setPaidBy] = useState(payment?.paidBy ?? "");
  const [m1, setM1] = useState<{ ok: boolean; text: string } | null>(null);
  const [m2, setM2] = useState<{ ok: boolean; text: string } | null>(null);
  const [m3, setM3] = useState<{ ok: boolean; text: string } | null>(null);
  const [m4, setM4] = useState<{ ok: boolean; text: string } | null>(null);
  const [del, setDel] = useState({ password: "", confirm: "" });
  const [pending, start] = useTransition();

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-display mb-5 text-3xl">Du i tipset</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Namn">
            <input className={inputClass} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} maxLength={60} />
          </Field>
          <Field label="Favoritlag">
            <select className={inputClass} value={p.favoriteTeamId} onChange={(e) => setP({ ...p, favoriteTeamId: e.target.value })}>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-6">
          <AvatarBuilder value={p.avatar} name={p.name} onChange={(avatar) => setP((x) => ({ ...x, avatar }))} />
        </div>
        <div className="mt-6 flex items-center gap-4">
          <Button
            variant="gold"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateProfile({ name: p.name, favoriteTeamId: p.favoriteTeamId, avatar: p.avatar });
                setM1(r.ok ? { ok: true, text: "Sparat!" } : { ok: false, text: r.error ?? "Fel" });
                if (r.ok) router.refresh();
              })
            }
          >
            Spara profil
          </Button>
          <Msg m={m1} />
        </div>
      </Card>

      {payment && (
        <Card id="betalning" className="scroll-mt-24">
          <h2 className="font-display text-3xl">Betalning · {payment.season}</h2>
          {payment.status === "CONFIRMED" || payment.status === "FREE" ? (
            <p className="mt-3 flex items-center gap-2 text-pitch">
              {payment.status === "FREE" ? <Gift className="size-5" /> : <CheckCircle2 className="size-5" />}
              {payment.status === "FREE" ? "Du är med gratis i år (tröstpriset från förra året)." : "Betalningen är bekräftad. Du är aktiv spelare!"}
            </p>
          ) : (
            <>
              <p className="mt-2 text-muted">
                Swisha <strong className="text-text">{payment.fee} kr</strong> till <strong className="text-text">{payment.swish}</strong>. Om någon annan
                swishar åt dig: skriv hens namn eller initialer.
              </p>
              {payment.status === "CLAIMED" && (
                <p className="mt-3 flex items-center gap-2 text-gold">
                  <Clock className="size-5" /> Du har angett att du swishat. Väntar på att Anders bekräftar.
                </p>
              )}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Field label="Swishat av (om inte du själv)">
                    <input className={inputClass} value={paidBy} onChange={(e) => setPaidBy(e.target.value)} maxLength={60} placeholder="T.ex. M.L." />
                  </Field>
                </div>
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await claimPayment({ paidBy });
                      setM3(r.ok ? { ok: true, text: "Tack! Anders bekräftar så snart som möjligt." } : { ok: false, text: r.error ?? "Fel" });
                      router.refresh();
                    })
                  }
                >
                  Jag har swishat
                </Button>
              </div>
              <div className="mt-2">
                <Msg m={m3} />
              </div>
            </>
          )}
        </Card>
      )}

      <Card>
        <h2 className="font-display mb-1 text-3xl">Byt lösenord</h2>
        <p className="mb-5 text-sm text-muted">Inloggad som {user.email}</p>
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await changePassword(pw);
              setM2(r.ok ? { ok: true, text: "Lösenordet är bytt." } : { ok: false, text: r.error ?? "Fel" });
              if (r.ok) setPw({ current: "", next: "" });
            });
          }}
        >
          <Field label="Nuvarande lösenord">
            <input type="password" autoComplete="current-password" className={inputClass} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </Field>
          <Field label="Nytt lösenord" hint="Minst 10 tecken, bokstäver och siffror">
            <input type="password" autoComplete="new-password" className={inputClass} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <div className="flex items-center gap-4 sm:col-span-2">
            <Button type="submit" variant="outline" disabled={pending}>
              Byt lösenord
            </Button>
            <Msg m={m2} />
          </div>
        </form>
      </Card>

      <Card id="dina-uppgifter" className="scroll-mt-24">
        <h2 className="font-display mb-1 text-3xl">Dina uppgifter</h2>
        <p className="text-sm text-muted">
          Läs hur vi hanterar dina uppgifter i{" "}
          <a href="/integritet" className="text-gold underline">
            integritetspolicyn
          </a>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/api/me/export"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-strong px-5 font-semibold hover:border-pitch"
          >
            <Download className="size-4" /> Ladda ner mina uppgifter
          </a>
        </div>
        <div className="mt-6 rounded-2xl border border-danger/40 bg-danger-dim/20 p-4">
          <h3 className="font-semibold text-danger">Radera mitt konto</h3>
          <p className="mt-1 text-sm text-muted">
            Tar bort konto, tips, chattmeddelanden, följningar, pushprenumerationer och din historik direkt. Det går inte att ångra.
          </p>
          <form
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!confirm("Radera ditt konto och all din data för gott?")) return;
              start(async () => {
                const r = await deleteAccount(del);
                if (r && !r.ok) setM4({ ok: false, text: r.error ?? "Fel" });
              });
            }}
          >
            <Field label="Lösenord">
              <input type="password" autoComplete="current-password" className={inputClass} value={del.password} onChange={(e) => setDel({ ...del, password: e.target.value })} />
            </Field>
            <Field label='Skriv "RADERA"'>
              <input className={inputClass} value={del.confirm} onChange={(e) => setDel({ ...del, confirm: e.target.value })} />
            </Field>
            <Button type="submit" variant="danger" disabled={pending || del.confirm !== "RADERA" || !del.password}>
              Radera konto
            </Button>
          </form>
          <div className="mt-2">
            <Msg m={m4} />
          </div>
        </div>
      </Card>
    </div>
  );
}
