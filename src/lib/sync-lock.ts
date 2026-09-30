/**
 * Lås för kritiska skrivningar (t.ex. att spara en ny tabell). Schemaläggaren, admins synkknapp och en extern cron kan
 * annars köra samtidigt och skapa dubbla tabeller och notiser.
 *
 * Två lager: en kö i processen (samma Node-process) och ett lån i databasen (andra processer, t.ex. `fly ssh`).
 * Lånet går ut av sig självt, så en krasch mitt i ett jobb låser aldrig för alltid.
 */
import { randomUUID } from "node:crypto";
import { db } from "./db";

const tails = new Map<string, Promise<void>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Lease = { id: string; until: number };
const parse = (v: string): Lease | null => {
  try {
    const l = JSON.parse(v) as Lease;
    return typeof l.id === "string" && typeof l.until === "number" ? l : null;
  } catch {
    return null;
  }
};

async function acquireLease(name: string, leaseMs: number, waitMs: number) {
  const key = `lock:${name}`;
  const id = randomUUID();
  const stop = Date.now() + waitMs;
  for (;;) {
    const value = JSON.stringify({ id, until: Date.now() + leaseMs } satisfies Lease);
    try {
      await db.setting.create({ data: { key, value } });
      return id;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
    const cur = await db.setting.findUnique({ where: { key } });
    if (cur) {
      const lease = parse(cur.value);
      // Utgånget (eller trasigt) lån: ta över atomiskt – bara den som ser exakt samma värde vinner
      if (!lease || lease.until < Date.now()) {
        const r = await db.setting.updateMany({ where: { key, value: cur.value }, data: { value } });
        if (r.count === 1) return id;
      }
    }
    if (Date.now() > stop) throw new Error(`Låset "${name}" är upptaget – en annan körning pågår.`);
    await sleep(250);
  }
}

async function releaseLease(name: string, id: string) {
  // Ta bara bort vårt eget lån
  await db.setting.deleteMany({ where: { key: `lock:${name}`, value: { contains: id } } }).catch(() => {});
}

/** Kör `fn` när ingen annan håller låset `name`. Köar (väntar högst `waitMs`) i stället för att hoppa över. */
export async function withLock<T>(name: string, fn: () => Promise<T>, { leaseMs = 90_000, waitMs = 60_000 } = {}): Promise<T> {
  const prev = tails.get(name) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => gate);
  tails.set(name, tail);
  await prev;
  try {
    const id = await acquireLease(name, leaseMs, waitMs);
    try {
      return await fn();
    } finally {
      await releaseLease(name, id);
    }
  } finally {
    release();
    if (tails.get(name) === tail) tails.delete(name);
  }
}
