"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpen,
  Crown,
  FlaskConical,
  Home,
  ListOrdered,
  LogOut,
  Menu,
  MessageCircle,
  Newspaper,
  PenLine,
  Settings,
  Shield,
  Table2,
  Trophy,
  User,
  X,
} from "lucide-react";
import { Avatar } from "./avatar";
import { Logo } from "./logo";
import { logout } from "@/app/actions/auth";
import { ADMIN_LINKS } from "./admin-links";

type NavUser = { name: string; avatar: string; role: string } | null;

const MAIN = [
  { href: "/min-sida", label: "Min sida", icon: User, auth: true },
  { href: "/tipsa", label: "Mitt tips", icon: PenLine, auth: true },
  { href: "/tipstabell", label: "Tipstabellen", icon: ListOrdered },
  { href: "/allsvenskan", label: "Allsvenskan", icon: Table2 },
  { href: "/chatt", label: "Chatt", icon: MessageCircle, auth: true },
  { href: "/nyheter", label: "Nyheter", icon: Newspaper },
  { href: "/heroes", label: "Heroes", icon: Crown },
];

export function Nav({ user, unread }: { user: NavUser; unread: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const items = MAIN.filter((i) => !i.auth || user);

  return (
    <>
      {/* Topp – desktop + mobil */}
      <header className="sticky top-0 z-50 border-b border-border/70 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Allsvenskantipset – startsidan">
            <Logo size={34} />
            <span className="font-display hidden text-2xl sm:inline">
              Allsvenskan<span className="text-gold">tipset</span>
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Huvudmeny">
            {items.map((i) => (
              <Link
                key={i.href}
                href={i.href}
                prefetch
                aria-current={active(i.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active(i.href) ? "bg-surface-3 text-text" : "text-muted hover:text-text"
                }`}
              >
                {i.label}
              </Link>
            ))}
            {user?.role === "ADMIN" && (
              <Link
                href="/admin"
                aria-current={active("/admin") ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold text-gold transition hover:brightness-110 ${active("/admin") ? "bg-surface-3" : ""}`}
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            {user ? (
              <>
                <Link
                  href="/notiser"
                  className="relative grid size-11 place-items-center rounded-xl text-muted transition hover:bg-surface-3 hover:text-text"
                  aria-label={unread ? `Notiser, ${unread} olästa` : "Notiser"}
                >
                  <Bell className="size-5" />
                  {unread > 0 && (
                    <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-red-700 px-1 text-xs font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
                </Link>
                <Link href="/profil" className="hidden items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-3 md:flex" aria-label="Profil">
                  <Avatar value={user.avatar} size={32} />
                  <span className="text-sm font-semibold">{user.name.split(" ")[0]}</span>
                </Link>
                <button
                  onClick={() => setOpen(true)}
                  className="grid size-11 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-text"
                  aria-label="Öppna meny"
                  aria-haspopup="dialog"
                  aria-controls="mobilmeny"
                  aria-expanded={open}
                >
                  <Menu className="size-5" />
                </button>
                <form action={logout} className="hidden lg:block">
                  <button className="grid size-11 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-text" aria-label="Logga ut">
                    <LogOut className="size-5" />
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/logga-in" className="rounded-xl px-4 py-2.5 text-sm font-semibold text-muted hover:text-text">
                  Logga in
                </Link>
                <Link href="/registrera" className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-[#1f1800] hover:brightness-110">
                  Gå med
                </Link>
                <button
                  onClick={() => setOpen(true)}
                  className="grid size-11 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-text"
                  aria-label="Öppna meny"
                  aria-haspopup="dialog"
                  aria-controls="mobilmeny"
                  aria-expanded={open}
                >
                  <Menu className="size-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Bottenmeny – mobil (max 5) */}
      {user && (
        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
          aria-label="Snabbmeny"
        >
          <div className="grid grid-cols-5">
            {[
              { href: "/", label: "Hem", icon: Home },
              { href: "/min-sida", label: "Min sida", icon: User },
              { href: "/tipstabell", label: "Tabellen", icon: ListOrdered },
              { href: "/chatt", label: "Chatt", icon: MessageCircle },
              { href: "/allsvenskan", label: "Serien", icon: Table2 },
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                prefetch
                aria-current={active(i.href) ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${
                  active(i.href) ? "text-gold" : "text-muted"
                }`}
              >
                <i.icon className="size-5" />
                {i.label}
              </Link>
            ))}
          </div>
        </nav>
      )}

      {/* Utfällbar meny: native <dialog> ger fokusfälla, Escape och inert bakgrund */}
      <dialog
        ref={dialogRef}
        id="mobilmeny"
        aria-label="Meny"
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        className="m-0 ml-auto h-dvh max-h-none w-[min(22rem,88vw)] max-w-none border-0 bg-transparent p-0 text-text backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {open && (
          <div className="flex h-full flex-col gap-1 overflow-y-auto border-l border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              {user ? (
                <div className="flex items-center gap-3">
                  <Avatar value={user.avatar} size={40} />
                  <span className="font-semibold">{user.name}</span>
                </div>
              ) : (
                <Logo size={36} />
              )}
              <button onClick={() => setOpen(false)} className="grid size-11 cursor-pointer place-items-center rounded-xl hover:bg-surface-3" aria-label="Stäng meny">
                <X className="size-5" />
              </button>
            </div>
            {[
              ...items,
              { href: "/regler", label: "Regler & priser", icon: BookOpen },
              ...(user ? [{ href: "/notiser", label: "Notiser", icon: Bell }, { href: "/profil", label: "Profil & inställningar", icon: Settings }] : []),
              { href: "/simulering", label: "Simulering", icon: FlaskConical },
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                prefetch
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold ${
                  active(i.href) ? "bg-surface-3 text-gold" : "text-text hover:bg-surface-3"
                }`}
              >
                <i.icon className="size-5 text-muted" />
                {i.label}
              </Link>
            ))}
            {user?.role === "ADMIN" && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-widest text-gold">
                  <Shield className="size-3.5" /> Tipskontoret
                </p>
                {ADMIN_LINKS.map((i) => {
                  const on = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      aria-current={on ? "page" : undefined}
                      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${on ? "bg-surface-3 text-gold" : "text-text hover:bg-surface-3"}`}
                    >
                      <i.icon className="size-4 text-muted" />
                      {i.label}
                    </Link>
                  );
                })}
              </div>
            )}
            {user && (
              <form action={logout} className="mt-auto pt-4">
                <button className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 font-semibold text-danger hover:bg-surface-3">
                  <LogOut className="size-5" /> Logga ut
                </button>
              </form>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

export function Footer({ admin, demo }: { admin: boolean; demo: boolean }) {
  return (
    <footer className="border-t border-border/60 py-10 text-sm text-muted">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex items-center gap-3">
          <Trophy className="size-5 text-gold" />
          <span>Allsvenskantipset sedan 2015. Minst antal fel vinner.</span>
        </div>
        <div className="-mx-2 flex flex-wrap">
          <Link href="/regler" className="px-2 py-2.5 hover:text-text">Regler</Link>
          <Link href="/heroes" className="px-2 py-2.5 hover:text-text">Heroes</Link>
          <Link href="/nyheter" className="px-2 py-2.5 hover:text-text">Nyheter</Link>
          <Link href="/integritet" className="px-2 py-2.5 hover:text-text">Integritet</Link>
          {admin && <Link href="/admin" className="px-2 py-2.5 font-semibold text-gold hover:brightness-110">Admin</Link>}
        </div>
      </div>
      {demo && (
        <p className="mx-auto mt-4 max-w-7xl px-4 text-xs text-faint md:px-6">
          Demoläge: tippare, spelarstatistik, chatt och odds är exempeldata. Admin kan rensa dem under Admin → Översikt.
        </p>
      )}
    </footer>
  );
}
