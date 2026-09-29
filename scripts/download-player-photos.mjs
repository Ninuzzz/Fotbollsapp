/**
 * Laddar ner spelarfoton till projektet, så att de följer med när någon klonar repot.
 *
 *   node scripts/download-player-photos.mjs <lista.json>
 *
 * Listan: [{ team, name, url }] (exporteras från databasen). Bilderna skalas till 256×256 WebP och sparas i
 * public/players/<lag>/<spelare>.webp. prisma/data/player-photos.json kopplar spelare → fil och används av seeden.
 * Bilder som inte går att hämta behåller sin ursprungliga länk.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const list = JSON.parse(await readFile(process.argv[2], "utf8"));
const out = [];
let ok = 0;
const failed = [];

async function one(p) {
  const dir = join("public", "players", slug(p.team));
  const rel = `/players/${slug(p.team)}/${slug(p.name)}.webp`;
  try {
    let buf;
    if (p.url.startsWith("data:")) buf = Buffer.from(p.url.split(",")[1], "base64");
    else {
      const res = await fetch(p.url, {
        headers: { "user-agent": "Mozilla/5.0 (Allsvenskantipset bildarkiv)", accept: "image/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    }
    const img = await sharp(buf)
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();
    await mkdir(dir, { recursive: true });
    await writeFile(join("public", rel), img);
    out.push({ team: p.team, name: p.name, file: rel });
    ok++;
  } catch (e) {
    failed.push(`${p.team} / ${p.name}: ${e.message}`);
    out.push({ team: p.team, name: p.name, url: p.url });
  }
}

// Några åt gången, så att ingen sajt belastas
for (let i = 0; i < list.length; i += 6) await Promise.all(list.slice(i, i + 6).map(one));

out.sort((a, b) => a.team.localeCompare(b.team, "sv") || a.name.localeCompare(b.name, "sv"));
await writeFile(join("prisma", "data", "player-photos.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`${ok} av ${list.length} bilder sparade i public/players`);
if (failed.length) console.log(`Behöll länken för ${failed.length}:\n  ` + failed.join("\n  "));
