"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Crown,
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
  useEffect(() => setOpen(false), [path]);
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
                aria-current={active(i.href) ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                  active(i.href) ? "bg-surface-3 text-text" : "text-muted hover:text-text"
                }`}
              >
                {i.label}
              </Link>
            ))}
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
                    <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
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
                  className="grid size-11 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-3 hover:text-text lg:hidden"
                  aria-label="Öppna meny"
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
                  className="grid size-11 cursor-pointer place-items-center rounded-xl text-muted hover:bg-surface-3 lg:hidden"
                  aria-label="Öppna meny"
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

      {/* Utfällbar meny */}
      {open && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Meny">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Stäng meny" />
          <div className="absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col gap-1 overflow-y-auto border-l border-border bg-surface p-4">
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
              ...(user?.role === "ADMIN" ? [{ href: "/admin", label: "Admin", icon: Shield }] : []),
            ].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold ${
                  active(i.href) ? "bg-surface-3 text-gold" : "text-text hover:bg-surface-3"
                }`}
              >
                <i.icon className="size-5 text-muted" />
                {i.label}
              </Link>
            ))}
            {user && (
              <form action={logout} className="mt-auto pt-4">
                <button className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 font-semibold text-danger hover:bg-surface-3">
                  <LogOut className="size-5" /> Logga ut
                </button>
              </form>
            )}
          </div>
        </div>
      )}
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
        <div className="flex flex-wrap gap-4">
          <Link href="/regler" className="hover:text-text">Regler</Link>
          <Link href="/heroes" className="hover:text-text">Heroes</Link>
          <Link href="/nyheter" className="hover:text-text">Nyheter</Link>
          <Link href="/integritet" className="hover:text-text">Integritet</Link>
          {admin && <Link href="/admin" className="font-semibold text-gold hover:brightness-110">Admin</Link>}
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
