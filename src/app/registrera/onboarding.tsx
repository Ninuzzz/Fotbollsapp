"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Copy, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { register } from "@/app/actions/auth";
import { Button, Field, inputClass } from "@/components/ui";
import { TeamCrest } from "@/components/team-crest";
import { AvatarBuilder } from "@/components/avatar-builder";
import { fmtDate } from "@/lib/format";

type Team = { id: string; name: string; shortName: string; logoUrl: string | null; primaryColor: string; secondaryColor: string };
type SeasonInfo = { name: string; entryFee: number; swishNumber: string; registrationDeadline: string; open: boolean; demo: boolean } | null;

const STEPS = ["Konto", "Favoritlag", "Avatar", "Betalning"];

/** Swish-länk för privatperson (öppnar appen med förifyllt belopp och meddelande) */
function swishUrl(number: string, amount: number, message: string) {
  const p = new URLSearchParams({ sw: number.replace(/\D/g, ""), amt: String(amount), cur: "SEK", msg: message.slice(0, 50), src: "qr" });
  return `https://app.swish.nu/1/p/sw/?${p}`;
}

export function Onboarding({ teams, season }: { teams: Team[]; season: SeasonInfo }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [data, setData] = useState({
    name: "",
    email: "",
    password: "",
    favoriteTeamId: "",
    avatar: "jersey:solid:#1d4ed8:#facc15:10",
    payment: "SELF" as "SELF" | "OTHER" | "LATER",
    paidBy: "",
    acceptPrivacy: false,
  });
  const [qr, setQr] = useState<string | null>(null);
  const team = teams.find((t) => t.id === data.favoriteTeamId);
  const message = `Tipset ${new Date().getFullYear()} ${data.name}`.trim();

  useEffect(() => {
    if (!season) return;
    QRCode.toDataURL(swishUrl(season.swishNumber, season.entryFee, message), { margin: 1, width: 220, color: { dark: "#050b08", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [season, message]);

  // Förhandsvisa lagets färger direkt när man väljer lag
  useEffect(() => {
    if (!team) return;
    document.body.style.setProperty("--team", team.primaryColor);
    document.body.style.setProperty("--team-2", team.secondaryColor);
  }, [team]);

  const validate = (s: number) => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (data.name.trim().length < 2) e.name = "Skriv ditt namn";
      if (!/^\S+@\S+\.\S+$/.test(data.email)) e.email = "Ogiltig e-postadress";
      if (data.password.length < 10) e.password = "Minst 10 tecken";
      else if (!/[a-zåäö]/i.test(data.password) || !/[0-9]/.test(data.password)) e.password = "Använd både bokstäver och siffror";
      if (!data.acceptPrivacy) e.acceptPrivacy = "Du behöver godkänna integritetspolicyn";
    }
    if (s === 1 && !data.favoriteTeamId) e.favoriteTeamId = "Välj ett lag";
    if (s === 3 && data.payment === "OTHER" && !data.paidBy.trim()) e.paidBy = "Skriv namn eller initialer";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const go = (d: number) => {
    if (d > 0 && !validate(step)) return;
    setDir(d);
    setStep((s) => Math.max(0, Math.min(STEPS.length - 1, s + d)));
  };

  const submit = () => {
    if (!validate(3)) return;
    start(async () => {
      const res = await register({ ...data, acceptPrivacy: data.acceptPrivacy as true });
      if (res?.ok) {
        router.push("/tipsa?valkommen=1");
        router.refresh();
      } else {
        setFormError(res?.error ?? "Något gick fel.");
        setErrors(res?.fieldErrors ?? {});
        if (res?.fieldErrors && ["name", "email", "password"].some((k) => res.fieldErrors?.[k])) setStep(0);
      }
    });
  };

  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">{season?.name ?? "Allsvenskantipset"}</p>
      <h1 className="font-display mt-2 text-5xl md:text-7xl">Gå med i tipset</h1>
      {season && !season.open && (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold-dim/40 p-4 text-sm">
          Anmälan för i år stängde {fmtDate(season.registrationDeadline)}. Du kan fortfarande skapa ett konto, chatta med när du blir
          aktiv och vara med nästa säsong.
        </p>
      )}

      {/* Stegindikator */}
      <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Steg">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}>
            <div className={`h-1.5 rounded-full transition-colors duration-500 ${i <= step ? "bg-gold" : "bg-surface-3"}`} />
            <p className={`mt-2 text-xs font-semibold md:text-sm ${i === step ? "text-text" : "text-muted"}`}>
              {i + 1}. {s}
            </p>
          </li>
        ))}
      </ol>

      <div className="card relative mt-6 overflow-hidden p-5 md:p-8">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.25 }}
          >
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="font-display text-3xl">Ditt konto</h2>
                <Field label="Namn" hint="Visas i tipstabellen, så skriv för- och efternamn." error={errors.name}>
                  <input className={inputClass} autoComplete="name" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
                </Field>
                <Field label="E-post" error={errors.email}>
                  <input className={inputClass} type="email" autoComplete="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} />
                </Field>
                <Field label="Lösenord" hint="Minst 10 tecken med både bokstäver och siffror." error={errors.password}>
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete="new-password"
                    value={data.password}
                    onChange={(e) => setData({ ...data, password: e.target.value })}
                  />
                </Field>
                <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${errors.acceptPrivacy ? "border-danger" : "border-border"}`}>
                  <input
                    type="checkbox"
                    checked={data.acceptPrivacy}
                    onChange={(e) => setData({ ...data, acceptPrivacy: e.target.checked })}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--gold)]"
                  />
                  <span>
                    Jag har läst{" "}
                    <a href="/integritet" target="_blank" rel="noopener" className="font-semibold text-gold underline">
                      integritetspolicyn
                    </a>{" "}
                    och godkänner att mitt namn, min avatar och mitt tips visas för andra deltagare. Jag kan när som helst radera mitt konto.
                    {errors.acceptPrivacy && <span className="mt-1 block text-danger">{errors.acceptPrivacy}</span>}
                  </span>
                </label>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="font-display text-3xl">Vilket är ditt lag?</h2>
                <p className="mt-1 text-muted">Ditt lag sätter färgen på din vy, och lagets stjärnspelare dyker upp på din sida.</p>
                {errors.favoriteTeamId && <p className="mt-2 text-sm text-danger">{errors.favoriteTeamId}</p>}
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Favoritlag">
                  {teams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={data.favoriteTeamId === t.id}
                      onClick={() => setData({ ...data, favoriteTeamId: t.id })}
                      className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border p-3 text-center text-sm font-semibold transition ${
                        data.favoriteTeamId === t.id ? "scale-[1.03] border-gold bg-surface-3" : "border-border hover:border-border-strong hover:bg-surface-2"
                      }`}
                      style={data.favoriteTeamId === t.id ? { boxShadow: `0 0 0 2px ${t.primaryColor}55, 0 10px 30px -10px ${t.primaryColor}` } : undefined}
                    >
                      <TeamCrest team={t} size={40} />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="font-display mb-1 text-3xl">Välj din avatar</h2>
                <p className="mb-6 text-muted">Syns bredvid ditt namn i tipstabellen och chatten.</p>
                <AvatarBuilder value={data.avatar} name={data.name} onChange={(avatar) => setData((d) => ({ ...d, avatar }))} />
              </div>
            )}

            {step === 3 && season && (
              <div>
                <h2 className="font-display text-3xl">Betala {season.entryFee} kr med Swish</h2>
                <p className="mt-1 text-muted">
                  Anders bekräftar betalningen. Därefter blir du aktiv spelare och kan spara ditt tips och använda chatten.
                </p>
                {season.demo && (
                  <p role="note" className="mt-4 rounded-xl border border-info/40 bg-info/10 px-4 py-3 text-sm">
                    <strong>Demoläge:</strong> du behöver inte swisha på riktigt. Välj ”Jag har swishat själv” och slutför. Anders får då en
                    notis, och din anmälan dyker upp under <strong>Admin → Deltagare</strong> där han kan bekräfta betalningen.
                  </p>
                )}
                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
                  <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-4 text-[#050b08]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {qr ? <img src={qr} alt="QR-kod för Swish-betalning" width={180} height={180} /> : <div className="size-[180px]" />}
                    <p className="text-xs font-semibold">Skanna i Swish-appen</p>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-border bg-bg/50 p-4">
                      <p className="text-xs uppercase tracking-widest text-muted">Swisha till</p>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="font-display text-4xl tracking-wider">{season.swishNumber}</p>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(season.swishNumber.replace(/\D/g, ""))}
                          className="grid size-10 cursor-pointer place-items-center rounded-lg hover:bg-surface-3"
                          aria-label="Kopiera nummer"
                        >
                          <Copy className="size-4" />
                        </button>
                      </div>
                      <p className="mt-2 text-sm">
                        Belopp: <strong>{season.entryFee} kr</strong> · Meddelande: <strong>{message}</strong>
                      </p>
                    </div>
                    <a
                      href={swishUrl(season.swishNumber, season.entryFee, message)}
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#e91e63]/90 px-4 font-bold text-white hover:bg-[#e91e63] md:hidden"
                    >
                      <Smartphone className="size-5" /> Öppna Swish
                    </a>
                  </div>
                </div>

                <fieldset className="mt-6 space-y-2">
                  <legend className="mb-2 text-sm font-semibold">Vem swishar?</legend>
                  {[
                    { v: "SELF", l: "Jag har swishat själv" },
                    { v: "OTHER", l: "Någon annan swishar åt mig" },
                    { v: "LATER", l: "Jag swishar senare" },
                  ].map((o) => (
                    <label
                      key={o.v}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 ${data.payment === o.v ? "border-gold bg-surface-3" : "border-border"}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value={o.v}
                        checked={data.payment === o.v}
                        onChange={() => setData({ ...data, payment: o.v as typeof data.payment })}
                        className="size-4 accent-[var(--gold)]"
                      />
                      {o.l}
                    </label>
                  ))}
                </fieldset>
                {data.payment === "OTHER" && (
                  <div className="mt-4">
                    <Field label="Namn eller initialer på den som swishar" error={errors.paidBy} hint="Så att Anders kan para ihop betalningen med dig.">
                      <input className={inputClass} value={data.paidBy} onChange={(e) => setData({ ...data, paidBy: e.target.value })} maxLength={60} />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {formError && (
          <p role="alert" className="mt-6 rounded-xl border border-danger/40 bg-danger-dim/40 px-4 py-3 text-sm text-danger">
            {formError}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={() => go(-1)} disabled={step === 0}>
            <ChevronLeft className="size-4" /> Tillbaka
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" variant="gold" onClick={() => go(1)}>
              Nästa <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button type="button" variant="gold" onClick={submit} disabled={pending}>
              {pending ? "Skapar konto…" : (
                <>
                  <Check className="size-4" /> Skapa konto & tippa
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
