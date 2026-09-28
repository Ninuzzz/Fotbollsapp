/** Grunddata för Allsvenskans lag (2026 + lag från tidigare år för återanvändning). */
export type TeamSeed = {
  name: string;
  shortName: string;
  aliases: string[];
  primaryColor: string;
  secondaryColor: string;
};

export const TEAMS_2026: TeamSeed[] = [
  { name: "AIK", shortName: "AIK", aliases: ["AIK Solna", "AIK Stockholm"], primaryColor: "#0b0b0b", secondaryColor: "#facc15" },
  { name: "IF Brommapojkarna", shortName: "BP", aliases: ["Brommapojkarna", "BP"], primaryColor: "#dc2626", secondaryColor: "#111111" },
  { name: "Degerfors IF", shortName: "DIF", aliases: ["Degerfors"], primaryColor: "#dc2626", secondaryColor: "#ffffff" },
  { name: "Djurgårdens IF", shortName: "DIF", aliases: ["Djurgarden", "Djurgården", "Djurgardens IF"], primaryColor: "#1e40af", secondaryColor: "#dc2626" },
  { name: "IF Elfsborg", shortName: "IFE", aliases: ["Elfsborg"], primaryColor: "#facc15", secondaryColor: "#111111" },
  { name: "GAIS", shortName: "GAIS", aliases: ["Gais", "GAIS Göteborg"], primaryColor: "#15803d", secondaryColor: "#111111" },
  { name: "Halmstad BK", shortName: "HBK", aliases: ["Halmstad", "Halmstads BK"], primaryColor: "#1d4ed8", secondaryColor: "#ffffff" },
  { name: "Hammarby IF", shortName: "HIF", aliases: ["Hammarby"], primaryColor: "#16a34a", secondaryColor: "#ffffff" },
  { name: "BK Häcken", shortName: "BKH", aliases: ["Hacken", "Häcken", "BK Hacken"], primaryColor: "#facc15", secondaryColor: "#111111" },
  { name: "IFK Göteborg", shortName: "IFKG", aliases: ["Goteborg", "Göteborg", "IFK Goteborg"], primaryColor: "#1d4ed8", secondaryColor: "#ffffff" },
  { name: "Kalmar FF", shortName: "KFF", aliases: ["Kalmar"], primaryColor: "#dc2626", secondaryColor: "#ffffff" },
  { name: "Malmö FF", shortName: "MFF", aliases: ["Malmo", "Malmö", "Malmo FF"], primaryColor: "#38bdf8", secondaryColor: "#ffffff" },
  { name: "Mjällby AIF", shortName: "MAIF", aliases: ["Mjallby", "Mjällby", "Mjallby AIF"], primaryColor: "#facc15", secondaryColor: "#111111" },
  { name: "IK Sirius", shortName: "IKS", aliases: ["Sirius", "IK Sirius FK"], primaryColor: "#1e3a8a", secondaryColor: "#111111" },
  { name: "Västerås SK", shortName: "VSK", aliases: ["Vasteraas", "Västerås", "Vasteras SK", "Vasteras"], primaryColor: "#15803d", secondaryColor: "#ffffff" },
  { name: "Örgryte IS", shortName: "ÖIS", aliases: ["Orgryte", "Örgryte", "Orgryte IS"], primaryColor: "#b91c1c", secondaryColor: "#1e3a8a" },
];

/** Lag som spelat tidigare år – finns i "lagbanken" för återanvändning. */
export const TEAMS_EARLIER: TeamSeed[] = [
  { name: "IFK Norrköping", shortName: "IFKN", aliases: ["Norrkoping", "Norrköping"], primaryColor: "#1d4ed8", secondaryColor: "#ffffff" },
  { name: "IFK Värnamo", shortName: "IFKV", aliases: ["Varnamo", "Värnamo"], primaryColor: "#1d4ed8", secondaryColor: "#facc15" },
  { name: "Östers IF", shortName: "ÖIF", aliases: ["Oster", "Öster", "Osters IF"], primaryColor: "#dc2626", secondaryColor: "#ffffff" },
];

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\b(if|ik|bk|ff|fk|aif|is|sk|ifk)\b/g, (m) => m) // behåll förkortningar
    .trim();
}

/** Matchar ett namn (t.ex. från API) mot lag med namn + alias. */
export function matchTeam<T extends { name: string; aliases: string | string[] }>(name: string, teams: T[]): T | undefined {
  const n = normalizeName(name);
  const aliasList = (t: T) => (Array.isArray(t.aliases) ? t.aliases : t.aliases.split(",").filter(Boolean));
  return (
    teams.find((t) => normalizeName(t.name) === n) ??
    teams.find((t) => aliasList(t).some((a) => normalizeName(a) === n)) ??
    teams.find((t) => n.includes(normalizeName(t.name)) || normalizeName(t.name).includes(n))
  );
}
