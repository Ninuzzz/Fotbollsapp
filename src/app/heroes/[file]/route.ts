import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
const DIR = join(process.cwd(), "private", "heroes");
// Bilderna visas som max ~256 px breda kort (2x = 512 px). Omkodade WebP-versioner hålls i minnet.
const optimized = new Map<string, Buffer>();
async function toWebp(file: string) {
  let out = optimized.get(file);
  if (!out) {
    out = await sharp(join(DIR, file)).resize({ width: 512, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    optimized.set(file, out);
  }
  return out;
}

/**
 * Vinnarbilderna ligger utanför public/ och serveras bara när vinnaren har gett samtycke
 * (admin ser alla). Annars svarar vi 404, så att bilden inte går att hämta med en gissad adress.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const m = /^([\w-]{1,60})\.(png|jpe?g|webp)$/i.exec(file);
  if (!m) return new NextResponse(null, { status: 404 });
  const hero = await db.hallOfFame.findFirst({ where: { imageUrl: `/heroes/${file}` }, select: { consent: true } });
  if (!hero) return new NextResponse(null, { status: 404 });
  if (!hero.consent && (await getCurrentUser())?.role !== "ADMIN") return new NextResponse(null, { status: 404 });
  try {
    const webp = req.headers.get("accept")?.includes("image/webp");
    const body = webp ? await toWebp(file) : await readFile(join(DIR, file));
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": webp ? "image/webp" : TYPES[m[2]!.toLowerCase()]!,
        Vary: "Accept, Cookie",
        // private: samtycket kan dras tillbaka, så delade cachar får inte spara bilden
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
