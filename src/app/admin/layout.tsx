import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">Admin · inloggad som {user.name}</p>
          <h1 className="font-display text-5xl md:text-6xl">Tipskontoret</h1>
        </div>
        <Link href="/" className="text-sm text-muted hover:text-text">
          Till sajten →
        </Link>
      </div>
      <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
        <AdminNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
