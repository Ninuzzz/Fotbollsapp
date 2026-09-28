"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { deleteBookmaker, saveOdds } from "@/app/actions/admin";
import { ActionButton, ResultText, smallInput, useAdminAction } from "../ui";

export function OddsEditor({
  teams,
  bookmakers,
  odds,
}: {
  teams: { id: string; name: string }[];
  bookmakers: string[];
  odds: Record<string, Record<string, number>>;
}) {
  const [book, setBook] = useState(bookmakers[0] ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(teams.map((t) => [t.id, odds[t.id]?.[bookmakers[0]]?.toString() ?? ""])));
  const { pending, result, run } = useAdminAction();

  const pick = (b: string) => {
    setBook(b);
    setValues(Object.fromEntries(teams.map((t) => [t.id, odds[t.id]?.[b]?.toString() ?? ""])));
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted">Spelbolag</span>
          <input className={smallInput} value={book} onChange={(e) => setBook(e.target.value)} list="books" placeholder="T.ex. Unibet" />
          <datalist id="books">
            {bookmakers.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        {bookmakers.map((b) => (
          <Button key={b} type="button" variant={b === book ? "gold" : "outline"} className="min-h-10 text-sm" onClick={() => pick(b)}>
            {b}
          </Button>
        ))}
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {teams.map((t) => (
          <label key={t.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <span className="flex-1 truncate text-sm">{t.name}</span>
            <input
              type="number"
              step="0.01"
              min="1.01"
              inputMode="decimal"
              value={values[t.id] ?? ""}
              onChange={(e) => setValues({ ...values, [t.id]: e.target.value })}
              className="min-h-9 w-20 rounded-lg border border-border-strong bg-bg/60 px-2 text-right tabular-nums"
              aria-label={`Odds ${t.name}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="gold"
          disabled={pending || !book.trim()}
          onClick={() =>
            run(() =>
              saveOdds({
                bookmaker: book,
                odds: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])),
              }),
            )
          }
        >
          Spara odds för {book || "…"}
        </Button>
        {bookmakers.includes(book) && (
          <ActionButton action={deleteBookmaker.bind(null, book)} variant="ghost" confirm={`Ta bort alla odds från ${book}?`}>
            Ta bort {book}
          </ActionButton>
        )}
        <ResultText result={result} />
      </div>
    </Card>
  );
}
