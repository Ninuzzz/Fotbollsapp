/**
 * Spelarfoton som sparats i repot (public/players + prisma/data/player-photos.json).
 * Kopplas till spelarna i den aktiva tävlingen – körs av seeden, när en ny tävling skapas och av `npm run photos:apply`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";

type Entry = { team: string; name: string; file?: string; url?: string };

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export async function applyPlayerPhotos(db: PrismaClient) {
  let entries: Entry[];
  try {
    entries = JSON.parse(readFileSync(join(process.cwd(), "prisma", "data", "player-photos.json"), "utf8"));
  } catch {
    return { applied: 0, total: 0 };
  }
  const season = (await db.season.findFirst({ where: { isActive: true } })) ?? (await db.season.findFirst({ orderBy: { year: "desc" } }));
  if (!season) return { applied: 0, total: entries.length };
  const players = await db.player.findMany({ where: { seasonId: season.id }, include: { team: true } });
  const byKey = new Map(players.map((p) => [`${key(p.team.name)}|${key(p.name)}`, p]));
  let applied = 0;
  for (const e of entries) {
    const photo = e.file ?? e.url;
    const p = byKey.get(`${key(e.team)}|${key(e.name)}`);
    // Bara spelare utan bild: en bild som Anders laddat upp själv skrivs aldrig över
    if (!photo || !p || p.photoUrl) continue;
    await db.player.update({ where: { id: p.id }, data: { photoUrl: photo } });
    applied++;
  }
  return { applied, total: entries.length };
}
