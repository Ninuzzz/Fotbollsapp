"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button, Field, inputClass } from "@/components/ui";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="E-post">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Lösenord">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      {state?.error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-dim/40 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="gold" className="w-full" disabled={pending}>
        {pending ? "Loggar in…" : "Logga in"}
      </Button>
    </form>
  );
}
