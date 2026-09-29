/**
 * Nyheter om Allsvenskan via publika RSS-flöden (ingen nyckel krävs).
 * Flöden konfigureras med NEWS_FEEDS (kommaseparerade URL:er).
 */
import { XMLParser } from "fast-xml-parser";
import { db } from "./db";

export type NewsItem = {
  title: string;
  link: string;
  source: string;
  publishedAt: string;
  image?: string;
};

const DEFAULT_FEEDS = ["https://news.google.com/rss/search?q=Allsvenskan&hl=sv&gl=SE&ceid=SE:sv"];

const TTL = 60 * 60 * 1000; // externa flöden anropas högst en gång i timmen
const KEY = "newsCache";
let refreshing: Promise<NewsItem[]> | null = null;

/**
 * Läser nyheter från vår egen databas. Besökare triggar aldrig anrop mot externa källor direkt –
 * cachen fylls av schemaläggaren (instrumentation.ts / cron) och, om den är äldre än en timme,
 * uppdateras den en gång i bakgrunden (samtidiga besökare delar på samma anrop).
 */
export async function getNews(limit = 30): Promise<NewsItem[]> {
  const row = await db.setting.findUnique({ where: { key: KEY } });
  const cached = row ? (JSON.parse(row.value) as { at: number; items: NewsItem[] }) : null;
  if (cached && Date.now() - cached.at < TTL) return cached.items.slice(0, limit);
  if (cached) {
    void refreshNews(); // stale-while-revalidate
    return cached.items.slice(0, limit);
  }
  return (await refreshNews()).slice(0, limit);
}

export function refreshNews(): Promise<NewsItem[]> {
  refreshing ??= fetchFeeds()
    .then(async (items) => {
      if (items.length)
        await db.setting.upsert({
          where: { key: KEY },
          create: { key: KEY, value: JSON.stringify({ at: Date.now(), items }) },
          update: { value: JSON.stringify({ at: Date.now(), items }) },
        });
      return items;
    })
    .finally(() => (refreshing = null));
  return refreshing;
}

/** Ett trasigt datum i flödet ska bara påverka den nyheten – inte kasta och tömma hela flödet. */
function safeDate(raw: unknown): string {
  const d = new Date(typeof raw === "string" || typeof raw === "number" ? raw : Date.now());
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function fetchFeeds(): Promise<NewsItem[]> {
  const feeds = (process.env.NEWS_FEEDS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []).length
    ? process.env.NEWS_FEEDS!.split(",").map((s) => s.trim())
    : DEFAULT_FEEDS;
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
  const all: NewsItem[] = [];
  await Promise.all(
    feeds.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000), headers: { "user-agent": "Allsvenskantipset/1.0" } });
        if (!res.ok) return;
        const xml = parser.parse(await res.text());
        const channel = xml?.rss?.channel;
        const items = Array.isArray(channel?.item) ? channel.item : channel?.item ? [channel.item] : [];
        for (const it of items) {
          const rawTitle: string = typeof it.title === "string" ? it.title : String(it.title?.["#text"] ?? "");
          const src =
            typeof it.source === "string" ? it.source : it.source?.["#text"] ?? channel?.title ?? new URL(url).hostname;
          // Google News lägger källan sist i titeln: "Rubrik - Källa"
          const title = rawTitle.endsWith(` - ${src}`) ? rawTitle.slice(0, -(src.length + 3)) : rawTitle;
          all.push({
            title,
            link: String(it.link ?? ""),
            source: String(src),
            publishedAt: safeDate(it.pubDate),
            image: it.enclosure?.["@url"] ?? it["media:content"]?.["@url"],
          });
        }
      } catch {
        // ett trasigt flöde ska inte sänka sidan
      }
    }),
  );
  all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const seen = new Set<string>();
  const items = all.filter((i) => (seen.has(i.title) ? false : (seen.add(i.title), true)));
  return items.slice(0, 40);
}
