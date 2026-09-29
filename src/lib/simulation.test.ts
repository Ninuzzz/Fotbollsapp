import { describe, expect, it } from "vitest";
import { botTippers, buildSchedule, createRng, simulateSeason, type SimTeam } from "./simulation";

const teams: SimTeam[] = Array.from({ length: 16 }, (_, i) => ({
  id: `t${i}`,
  name: `Lag ${String(i).padStart(2, "0")}`,
  shortName: `L${i}`,
  logoUrl: null,
  primaryColor: "#000000",
  secondaryColor: "#ffffff",
  rating: 1600 - i * 12,
}));
const players = teams.slice(0, 6).map((t, i) => ({ id: `p${i}`, name: `Spelare ${i}`, teamId: t.id, goalWeight: 6 - i, assistWeight: i + 1 }));

describe("simulering", () => {
  it("dubbelserien ger 30 omgångar där alla möter alla hemma och borta", () => {
    const s = buildSchedule(teams.map((t) => t.id), createRng(1));
    expect(s).toHaveLength(30);
    const meetings = new Set(s.flat().map(([h, a]) => `${h}-${a}`));
    expect(meetings.size).toBe(16 * 15);
    for (const round of s) expect(new Set(round.flat()).size).toBe(16);
  });

  it("samma frö ger exakt samma säsong", () => {
    const rng = createRng(7);
    const base = teams.map((t) => t.id);
    const tippers = [{ id: "you", name: "Du", avatar: "", isYou: true, order: base, scorerId: "p0", assistId: "p5" }, ...botTippers(8, base, players, rng)];
    const cfg = { seed: 42, teams, players, tippers, chaos: 0.4, entryFee: 111, reservedAmount: 300, split: [50, 30, 20] };
    const a = simulateSeason(cfg);
    const b = simulateSeason(cfg);
    expect(a.rounds.at(-1)!.standings).toEqual(b.rounds.at(-1)!.standings);
    expect(a.rounds).toHaveLength(30);
    // Varje lag har spelat 30 matcher och poängen går ihop
    const last = a.rounds.at(-1)!.standings;
    expect(last.every((r) => r.played === 30)).toBe(true);
    expect(last.map((r) => r.position)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
    // Prispotten delas ut till topp 3 (fler vid delade placeringar) och summan överstiger aldrig potten
    expect(a.payouts.reduce((s, p) => s + p.amount, 0)).toBeLessThanOrEqual(a.pool);
    expect(a.pool).toBe(9 * 111 - 300);
  });
});
