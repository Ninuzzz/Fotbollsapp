"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_LINKS as LINKS } from "@/components/admin-links";

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Adminmeny" className="no-scrollbar -mx-4 flex gap-1 relative overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
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
