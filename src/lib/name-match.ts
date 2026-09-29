/**
 * Namnmatchning mellan datakällor. ESPN skriver "Victor Eriksson", API-Football "V. Eriksson";
 * ESPN "Hammarby IF", API-Football "Hammarby FF". Rena funktioner, så att de går att testa.
 */

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Klubbförkortningar som skiljer sig mellan källor och inte säger något om vilket lag det är
const CLUB_TOKENS = new Set(["if", "ik", "bk", "ff", "fk", "fc", "aif", "is", "sk", "ifk", "bois", "fotboll"]);

/** "Hammarby IF" och "Hammarby FF" → "hammarby"; "Halmstads BK" → "halmstad" */
export function coreTeamName(name: string): string {
  const words = plain(name).split(" ").filter((w) => !CLUB_TOKENS.has(w));
  return words.join(" ").replace(/s\b/g, "") || plain(name);
}

/** Damlag och ungdomslag har samma klubbnamn – dem vill vi aldrig matcha mot */
export function isSeniorMenTeam(name: string): boolean {
  return !/\b(w|women|dam|u\d{2}|ii|2|b)\b/i.test(name);
}

/**
 * Matchar ett spelarnamn från API-Football mot våra namn inom ett lag.
 * Kräver ett ENTYDIGT svar: två spelare som båda passar ("V. Eriksson") ger ingen träff hellre än fel foto.
 */
export function matchPlayerName<T extends { name: string }>(apiName: string, candidates: T[]): T | undefined {
  const a = plain(apiName);
  const exact = candidates.filter((c) => plain(c.name) === a);
  if (exact.length === 1) return exact[0];
  // "V. Eriksson" / "O. Steinke Branby" → förnamnets initial + efternamn; annars första bokstaven + resten
  const [first = "", ...rest] = a.split(" ");
  const surname = rest.join(" ");
  if (!surname) return undefined;
  const initial = first[0];
  const hits = candidates.filter((c) => {
    const n = plain(c.name);
    return n.endsWith(` ${surname}`) && n.startsWith(initial ?? "");
  });
  return hits.length === 1 ? hits[0] : undefined;
}
