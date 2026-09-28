/**
 * Spelarfoton från TheSportsDB (gratis, publik testnyckel "123" – sätt THESPORTSDB_KEY för egen nyckel).
 * För att aldrig visa fel person krävs EXAKT namnmatchning (efter normalisering av å/ä/ö/ø osv.).
 */
import { normalizeName } from "./teams-data";

type SdbPlayer = { strPlayer: string; strTeam?: string; strCutout?: string | null; strThumb?: string | null; strRender?: string | null };

const norm = (s: string) =>
  normalizeName(s.replace(/ø/gi, "o").replace(/æ/gi, "ae").replace(/ß/g, "ss"))
    .replace(/\s+/g, " ")
    .trim();

export async function findPlayerPhoto(name: string, team: { name: string; aliases: string }): Promise<string | null> {
  const key = process.env.THESPORTSDB_KEY ?? "123";
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${key}/searchplayers.php?p=${encodeURIComponent(name)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const { player } = (await res.json()) as { player: SdbPlayer[] | null };
    const exact = (player ?? []).filter((p) => norm(p.strPlayer) === norm(name));
    if (!exact.length) return null;
    // Föredra spelaren i rätt lag om det finns flera med samma namn
    const teamNames = [team.name, ...team.aliases.split(",")].map(norm).filter(Boolean);
    const best =
      exact.find((p) => p.strTeam && teamNames.some((t) => norm(p.strTeam!).includes(t) || t.includes(norm(p.strTeam!)))) ??
      (exact.length === 1 ? exact[0] : undefined);
    const url = best?.strCutout || best?.strThumb || best?.strRender || null;
    return url && url.startsWith("https://") ? url : null;
  } catch {
    return null;
  }
}
