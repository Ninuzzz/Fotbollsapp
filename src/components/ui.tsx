import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "gold" | "ghost" | "outline" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-pitch text-[#03170b] hover:brightness-110 shadow-[0_8px_30px_-8px_var(--pitch)]",
  gold: "bg-gold text-[#1f1800] hover:brightness-110 shadow-[0_8px_30px_-8px_var(--gold)]",
  ghost: "bg-transparent text-text hover:bg-surface-3",
  outline: "border border-border-strong bg-surface/60 text-text hover:border-pitch hover:bg-surface-3",
  danger: "bg-danger text-white hover:brightness-110",
};

const base =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-[15px] font-semibold transition duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

/**
 * Knapplänkar förhämtar hela sidan (inte bara laddningsvyn) när de syns, så att första klicket känns lika
 * snabbt som ett återbesök. Våra sidor ändrar inget när de hämtas, så förhämtning är ofarlig.
 */
export function ButtonLink({
  variant = "primary",
  className = "",
  prefetch = true,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link prefetch={prefetch} className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ className = "", children, ...props }: ComponentProps<"div">) {
  return (
    <div className={`card p-5 md:p-6 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Badge({ tone = "neutral", children, className = "" }: { tone?: "neutral" | "pitch" | "gold" | "danger" | "info"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-3 text-muted border-border",
    pitch: "bg-pitch-dim/60 text-pitch border-pitch/30",
    gold: "bg-gold-dim/60 text-gold border-gold/30",
    danger: "bg-danger-dim/60 text-danger border-danger/30",
    info: "bg-info/15 text-info border-info/30",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 md:mb-10">
      {kicker && <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-gold">{kicker}</p>}
      <h1 className="font-display text-5xl md:text-7xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted md:text-lg">{children}</div>}
    </header>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4" id={id}>
      <h2 className="font-display text-3xl md:text-4xl">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "text" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "text" | "gold" | "pitch" | "danger" }) {
  const c = { text: "text-text", gold: "text-gold", pitch: "text-pitch", danger: "text-danger" }[tone];
  return (
    <div className="card p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
      <p className={`font-display mt-2 text-5xl md:text-6xl ${c}`}>{value}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-10 text-center">
      <p className="font-display text-3xl">{title}</p>
      {children && <div className="max-w-md text-muted">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-danger">{error}</span> : hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full min-h-11 rounded-xl border border-border-strong bg-bg/60 px-3.5 py-2.5 text-base text-text placeholder:text-faint transition focus:border-pitch focus:outline-none focus:ring-2 focus:ring-pitch/30";
