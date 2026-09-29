"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Smile, Trash2 } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { fmtTime, fmtDate } from "@/lib/format";

type Msg = { id: string; body: string; createdAt: string; user: { id: string; name: string; avatar: string; role: string } };

const EMOJIS = ["⚽", "🥅", "🏆", "🚀", "📉", "🔥", "😂", "🤣", "😅", "😭", "😱", "🤯", "😎", "🤔", "🙈", "👏", "🙌", "💪", "👍", "👎", "🎉", "🍺", "☕", "🟨", "🟥", "💚", "💙", "💛", "❤️", "🖤", "🤝", "🧤"];

export function Chat({ me }: { me: { id: string; role: string } }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emoji, setEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const last = useRef<string | null>(null);

  const scrollDown = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));

  const poll = useCallback(async () => {
    const url = last.current ? `/api/chat?after=${encodeURIComponent(last.current)}` : "/api/chat";
    const res = await fetch(url, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const { messages: incoming } = (await res.json()) as { messages: Msg[] };
    if (!incoming.length) return;
    last.current = incoming.at(-1)!.createdAt;
    setMessages((m) => {
      const seen = new Set(m.map((x) => x.id));
      return [...m, ...incoming.filter((x) => !seen.has(x.id))];
    });
    scrollDown();
  }, []);

  useEffect(() => {
    poll();
    // Enkel polling – robust och räcker gott för ett kompisgäng. Pausas när fliken är dold.
    const t = setInterval(() => document.visibilityState === "visible" && poll(), 4000);
    return () => clearInterval(t);
  }, [poll]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
    setSending(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Kunde inte skicka");
      return;
    }
    setText("");
    setEmoji(false);
    await poll();
    inputRef.current?.focus();
  };

  const remove = async (id: string) => {
    if (!confirm("Ta bort meddelandet?")) return;
    const res = await fetch(`/api/chat?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setMessages((m) => m.filter((x) => x.id !== id));
  };

  let lastDay = "";
  return (
    <div className="card flex h-[calc(100dvh-21rem-env(safe-area-inset-bottom))] min-h-[20rem] flex-col overflow-hidden p-0 md:h-[34rem]">
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto p-4" aria-live="polite" aria-label="Meddelanden">
        {messages.map((m) => {
          const day = fmtDate(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = m.user.id === me.id;
          return (
            <div key={m.id}>
              {showDay && <p className="my-3 text-center text-xs font-semibold uppercase tracking-widest text-faint">{day}</p>}
              <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                <Avatar value={m.user.avatar} name={m.user.name} size={32} />
                <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${mine ? "rounded-br-sm bg-team/25" : "rounded-bl-sm bg-surface-3"}`}>
                  {!mine && (
                    <p className="text-xs font-bold text-gold">
                      {m.user.name}
                      {m.user.role === "ADMIN" && <span className="ml-1 text-pitch">· admin</span>}
                    </p>
                  )}
                  {/* React escapar innehållet – ingen HTML från användare renderas */}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-0.5 text-right text-[11px] text-muted">{fmtTime(m.createdAt)}</p>
                </div>
                {(mine || me.role === "ADMIN") && (
                  <button
                    onClick={() => remove(m.id)}
                    className="grid size-9 cursor-pointer place-items-center rounded-lg text-faint opacity-0 transition hover:text-danger focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    aria-label="Ta bort meddelande"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {emoji && (
        <div className="grid grid-cols-8 gap-1 border-t border-border bg-surface p-2 sm:grid-cols-16" role="group" aria-label="Emojis">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setText((t) => t + e);
                inputRef.current?.focus();
              }}
              className="grid size-10 cursor-pointer place-items-center rounded-lg text-xl hover:bg-surface-3"
              aria-label={`Infoga ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-border bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <button
          type="button"
          onClick={() => setEmoji((v) => !v)}
          aria-expanded={emoji}
          aria-label="Emojis"
          className={`grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl ${emoji ? "bg-surface-3 text-gold" : "text-muted hover:bg-surface-3"}`}
        >
          <Smile className="size-5" />
        </button>
        <label htmlFor="chat-input" className="sr-only">
          Skriv ett meddelande
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder="Skriv något…"
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-border-strong bg-bg/60 px-3.5 py-2.5 text-base"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-gold text-[#1f1800] disabled:opacity-40"
          aria-label="Skicka"
        >
          <Send className="size-5" />
        </button>
      </form>
      {error && (
        <p role="alert" className="bg-danger-dim px-4 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
