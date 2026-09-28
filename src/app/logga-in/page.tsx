import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Logga in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/min-sida");
  const { next } = await searchParams;
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={56} />
        <h1 className="font-display mt-4 text-5xl">Välkommen tillbaka</h1>
        <p className="mt-2 text-muted">Logga in för att se ditt tips och hur du ligger till.</p>
      </div>
      <div className="card p-6">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-center text-muted">
        Inte med än?{" "}
        <Link href="/registrera" className="font-semibold text-gold hover:underline">
          Gå med i årets tips
        </Link>
      </p>
    </div>
  );
}
