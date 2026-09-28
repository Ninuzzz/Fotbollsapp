import { describe, expect, it } from "vitest";
import { computeErrors, rankEntries } from "./scoring";
import { distributePrizes, lastPlace, prizePool } from "./prizes";
import { computeAwards } from "./awards";
import { validateTip } from "./tip-validation";

describe("computeErrors", () => {
  it("räknar fel per lag – MFF tippad 1:a som blir 3:a ger 2 fel", () => {
    const r = computeErrors({ mff: 1, aik: 2, dif: 3 }, { mff: 3, aik: 2, dif: 1 });
    expect(r.total).toBe(4);
    expect(r.exact).toBe(1);
    expect(r.perTeam.find((t) => t.teamId === "mff")?.diff).toBe(2);
  });
});

describe("rankEntries – tie-breakers", () => {
  const base = { exact: 0, scorerGoals: 10, assistCount: 5 };
  it("minst fel vinner", () => {
    const r = rankEntries([
      { id: "a", errors: 40, ...base },
      { id: "b", errors: 30, ...base },
    ]);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("1. skytteligavinnarens mål avgör", () => {
    const r = rankEntries(
      [
        { id: "a", errors: 30, exact: 5, scorerGoals: 8, assistCount: 9 },
        { id: "b", errors: 30, exact: 0, scorerGoals: 12, assistCount: 1 },
      ],
      15,
      10,
    );
    expect(r[0].id).toBe("b");
    expect(r[1].decidedBy).toBe("scorer");
    expect(r[0].scorerGap).toBe(3);
  });
  it("2. assist avgör vid lika mål", () => {
    const r = rankEntries(
      [
        { id: "a", errors: 30, exact: 5, scorerGoals: 12, assistCount: 4 },
        { id: "b", errors: 30, exact: 0, scorerGoals: 12, assistCount: 7 },
      ],
      15,
      10,
    );
    expect(r[0].id).toBe("b");
    expect(r[1].decidedBy).toBe("assist");
  });
  it("3. flest exakta avgör därefter", () => {
    const r = rankEntries([
      { id: "a", errors: 30, exact: 2, scorerGoals: 12, assistCount: 7 },
      { id: "b", errors: 30, exact: 4, scorerGoals: 12, assistCount: 7 },
    ]);
    expect(r[0].id).toBe("b");
  });
  it("4. annars delad placering (1, 2, 2, 4)", () => {
    const r = rankEntries([
      { id: "a", errors: 10, ...base },
      { id: "b", errors: 20, ...base },
      { id: "c", errors: 20, ...base },
      { id: "d", errors: 30, ...base },
    ]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
  });
  it("ej tippad skytt hamnar efter", () => {
    const r = rankEntries([
      { id: "a", errors: 30, exact: 9, scorerGoals: null, assistCount: 9 },
      { id: "b", errors: 30, exact: 0, scorerGoals: 1, assistCount: 0 },
    ]);
    expect(r[0].id).toBe("b");
  });
});

describe("prispott", () => {
  it("600 kr avsätts, resten fördelas", () => {
    // Regelexemplet: 30 deltagare à 100 kr → 2400 kr i priser → 1200/720/480
    expect(prizePool({ entryFee: 100, participants: 30, reservedAmount: 600, split: [] })).toBe(2400);
    const p = distributePrizes(
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
        { id: "c", rank: 3 },
        { id: "d", rank: 4 },
      ],
      2400,
    );
    expect(p.map((x) => x.amount)).toEqual([1200, 720, 480]);
  });
  it("3+ delar 1:a → delar lika på hela potten", () => {
    const p = distributePrizes(
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 1 },
        { id: "c", rank: 1 },
        { id: "d", rank: 4 },
      ],
      3000,
    );
    expect(p).toHaveLength(3);
    expect(p.every((x) => x.amount === 1000)).toBe(true);
  });
  it("2 delar 1:a → delar 1:ans + 2:ans del, 3:an får sin", () => {
    const p = distributePrizes(
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 1 },
        { id: "c", rank: 3 },
      ],
      1000,
    );
    expect(p.find((x) => x.id === "a")?.amount).toBe(400);
    expect(p.find((x) => x.id === "c")?.amount).toBe(200);
  });
  it("2+ delar 2:a → delar 2:ans + 3:ans del", () => {
    const p = distributePrizes(
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
        { id: "c", rank: 2 },
        { id: "d", rank: 2 },
      ],
      1000,
    );
    expect(p.find((x) => x.id === "a")?.amount).toBe(500);
    expect(p.find((x) => x.id === "b")?.amount).toBe(166);
  });
  it("2+ delar 3:e → delar 3:ans del", () => {
    const p = distributePrizes(
      [
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
        { id: "c", rank: 3 },
        { id: "d", rank: 3 },
      ],
      1000,
    );
    expect(p.find((x) => x.id === "c")?.amount).toBe(100);
    expect(p.find((x) => x.id === "d")?.amount).toBe(100);
  });
  it("sistaplatsen – alla som delar den", () => {
    expect(
      lastPlace([
        { id: "a", rank: 1 },
        { id: "b", rank: 2 },
        { id: "c", rank: 2 },
      ]),
    ).toEqual(["b", "c"]);
  });
});

describe("utmärkelser", () => {
  it("raket, djupdykning och jojo", () => {
    const prev = new Map([
      ["a", 10],
      ["b", 2],
      ["c", 5],
    ]);
    const cur = new Map([
      ["a", 3],
      ["b", 8],
      ["c", 5],
    ]);
    const hist = new Map([
      ["a", [12, 10, 3]],
      ["b", [9, 2, 8]],
      ["c", [5, 5, 5]],
    ]);
    const a = computeAwards(prev, cur, hist);
    expect(a.find((x) => x.kind === "ROCKET")).toEqual({ kind: "ROCKET", delta: 7, entryIds: ["a"] });
    expect(a.find((x) => x.kind === "DIVE")?.entryIds).toEqual(["b"]);
    expect(a.find((x) => x.kind === "YOYO")?.entryIds).toEqual(["b"]);
  });
});

describe("validateTip", () => {
  const teams = Array.from({ length: 16 }, (_, i) => `t${i}`);
  it("godkänner 16 unika lag", () => {
    expect(validateTip(teams, teams).ok).toBe(true);
  });
  it("hittar dubbletter", () => {
    const t = [...teams];
    t[3] = t[0];
    const r = validateTip(t, teams);
    expect(r.ok).toBe(false);
    expect(r.duplicates).toEqual([0, 3]);
    expect(r.missing).toEqual(["t3"]);
  });
});
