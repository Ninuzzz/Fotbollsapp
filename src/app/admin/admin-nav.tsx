"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Coins, Crown, LayoutDashboard, Megaphone, Shield, Table2, UserRound, Users } from "lucide-react";

const LINKS = [
  { href: "/admin", label: "Översikt", icon: LayoutDashboard },
  { href: "/admin/tavlingar", label: "Tävlingar", icon: CalendarRange },
  { href: "/admin/deltagare", label: "Deltagare", icon: Users },
  { href: "/admin/tabell", label: "Tabell", icon: Table2 },
  { href: "/admin/lag", label: "Lag", icon: Shield },
  { href: "/admin/spelare", label: "Spelare & mål", icon: UserRound },
  { href: "/admin/utskick", label: "Utskick", icon: Megaphone },
  { href: "/admin/odds", label: "Odds", icon: Coins },
  { href: "/admin/heroes", label: "Heroes & historik", icon: Crown },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Adminmeny" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
      {LINKS.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
              active ? "bg-surface-3 text-gold" : "text-muted hover:bg-surface-2 hover:text-text"
            }`}
          >
            <l.icon className="size-4" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
