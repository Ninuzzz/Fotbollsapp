/**
 * Kopplar de sparade spelarfotona (public/players + prisma/data/player-photos.json) till spelarna i databasen.
 * Körs automatiskt av seeden. Fristående: `npm run photos:apply` (t.ex. efter att trupperna hämtats på nytt).
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Entry = { team: string; name: string; file?: string; url?: string };

const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export async function applyPlayerPhotos(db: PrismaClient) {
  const entries: Entry[] = JSON.parse(readFileSync(join(__dirname, "data", "player-photos.json"), "utf8"));
  const season = (await db.season.findFirst({ where: { isActive: true } })) ?? (await db.season.findFirst({ orderBy: { year: "desc" } }));
  if (!season) return { applied: 0, total: entries.length };
  const players = await db.player.findMany({ where: { seasonId: season.id }, include: { team: true } });
  const byKey = new Map(players.map((p) => [`${key(p.team.name)}|${key(p.name)}`, p]));
  let applied = 0;
  for (const e of entries) {
    const photo = e.file ?? e.url;
    const p = byKey.get(`${key(e.team)}|${key(e.name)}`);
    if (!photo || !p || p.photoUrl === photo) continue;
    await db.player.update({ where: { id: p.id }, data: { photoUrl: photo } });
    applied++;
  }
  return { applied, total: entries.length };
}

if (require.main === module) {
  const db = new PrismaClient();
  applyPlayerPhotos(db)
    .then((r) => console.log(`Spelarfoton: ${r.applied} uppdaterade (${r.total} i arkivet)`))
    .finally(() => db.$disconnect());
}
