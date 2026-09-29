import "server-only";
import { headers } from "next/headers";
import { timingSafeEqual } from "node:crypto";

/**
 * Enkel rate limiter i minnet (sliding window). Räcker för en instans.
 * Kör du flera instanser: byt till Redis/Upstash med samma gränssnitt.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((windowMs - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    // städa gamla nycklar
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return { ok: true, retryAfter: 0 };
}

export async function clientIp() {
  const h = await headers();
  // Klienten kan själv skicka vilka IP-huvuden som helst. Lita bara på huvudet som den egna proxyn sätter
  // (TRUSTED_IP_HEADER, t.ex. "fly-client-ip" på Fly.io), annars på det SISTA ledet i X-Forwarded-For,
  // som läggs till av närmaste proxy och inte kan förfalskas av klienten.
  const trusted = process.env.TRUSTED_IP_HEADER?.toLowerCase();
  if (trusted) return h.get(trusted)?.split(",")[0]?.trim() || "unknown";
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown";
}

/**
 * CSRF-skydd för route handlers (Server Actions kontrolleras redan av Next.js).
 * Kräver att Origin matchar Host för muterande anrop.
 */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Jämförelse i konstant tid (för hemligheter som CRON_SECRET) */
export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function cronAuthorized(authHeader: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret === "byt-mig" || secret.length < 16) return false;
  return safeEqual(authHeader ?? "", `Bearer ${secret}`);
}

/** Tillåt endast små bilder som data-URL (avatarer, nyhetsbilder) */
const DATA_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
export function isSafeDataImage(v: string, maxBytes = 200_000) {
  return v.length <= maxBytes * 1.37 && DATA_IMG.test(v);
}

/** Tillåt endast http(s)-länkar och interna sökvägar – blockerar javascript:-URL:er */
export function isSafeUrl(v: string) {
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Validering av avatarvärde: tröj-sträng, intern bild eller säker data-URL */
const JERSEY = /^jersey:(solid|stripes|hoops|halves|sash):#[0-9a-fA-F]{6}:#[0-9a-fA-F]{6}:[0-9]{1,2}$/;
export function isValidAvatar(v: string) {
  return JERSEY.test(v) || isSafeDataImage(v, 120_000);
}
