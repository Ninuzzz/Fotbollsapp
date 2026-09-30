/**
 * Kontrakttest mot ESPN:s (odokumenterade) tabell-API. Körs dagligen i CI (.github/workflows/espn-contract.yml) och
 * larmar om formatet ändras eller datan slutar hänga ihop – innan det syns för användarna.
 *
 *   npx tsx scripts/check-espn.ts [år]
 *
 * Kontrollerar att alla fält synken läser finns, och att tabellen klarar samma invarianter som appen kräver
 * (lib/standings-validation.ts). Avslutar med kod 1 vid fel.
 */
import { validateStandings } from "../src/lib/standings-validation";

const year = Number(process.argv[2] ?? new Date().getFullYear());
const URL = (y: number) => `https://site.api.espn.com/apis/v2/sports/soccer/${process.env.ESPN_LEAGUE ?? "swe.1"}/standings?season=${y}`;
const NEED = ["rank", "gamesPlayed", "wins", "ties", "losses", "pointsFor", "pointsAgainst", "points"];

type Entry = { team: { id: string; displayName: string }; stats: { name: string; value?: number }[] };

type Standings = { season?: number; entries?: Entry[] };

async function fetchStandings(y: number): Promise<Standings | null> {
  const res = await fetch(URL(y), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`ESPN svarade ${res.status}`);
  const json = (await res.json()) as { children?: { standings?: Standings }[] };
  return json.children?.[0]?.standings ?? null;
}

async function main() {
  let y = year;
  let st = await fetchStandings(y);
  // Före seriestart finns ingen tabell för årets säsong (appen hanterar det). Då kontrolleras formatet mot förra årets.
  if (!st?.entries?.length || (st.season && st.season !== y)) {
    console.log(`Ingen tabell för ${y} än (serien har inte startat) – kontrollerar formatet mot ${y - 1}.`);
    y -= 1;
    st = await fetchStandings(y);
  }
  if (!st?.entries?.length) throw new Error("Svaret saknar children[0].standings.entries – ESPN har ändrat formatet");
  if (st.season && st.season !== y) throw new Error(`ESPN visar säsong ${st.season} när ${y} efterfrågades`);
  const missing = NEED.filter((n) => !st.entries![0]?.stats.some((s) => s.name === n && typeof s.value === "number"));
  if (missing.length) throw new Error(`Fälten saknas i svaret: ${missing.join(", ")} – ESPN har ändrat formatet`);
  const v = (e: Entry, n: string) => Math.round(e.stats.find((s) => s.name === n)?.value ?? 0);
  const rows = st.entries.map((e) => ({
    teamId: e.team.id,
    position: v(e, "rank"),
    played: v(e, "gamesPlayed"),
    won: v(e, "wins"),
    drawn: v(e, "ties"),
    lost: v(e, "losses"),
    goalsFor: v(e, "pointsFor"),
    goalsAgainst: v(e, "pointsAgainst"),
    points: v(e, "points"),
  }));
  const names = new Map(st.entries.map((e) => [e.team.id, e.team.displayName]));
  const issues = validateStandings(rows, { expectedTeams: 16, totalRounds: 30, names });
  if (issues.length) throw new Error(`Tabellen klarar inte kontrollerna:\n - ${issues.join("\n - ")}`);
  console.log(`OK: ${rows.length} lag, ${Math.max(...rows.map((r) => r.played))} omgångar spelade, alla fält och kontroller stämmer.`);
}

main().catch((e) => {
  console.error("ESPN-kontrollen misslyckades:", (e as Error).message);
  process.exit(1);
});
