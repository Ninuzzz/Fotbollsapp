import { describe, expect, it } from "vitest";
import { buildSeasonGuide, type GuideState } from "./season-guide";
import { nextName, plusOneYear } from "./season-admin";

const base = (over: Partial<GuideState> = {}): GuideState => ({
  now: new Date("2026-06-01T12:00:00Z"),
  season: {
    name: "Tips Allsvenskan 2026", year: 2026, isFinished: false, totalRounds: 30,
    startDate: new Date("2026-04-05T13:00:00Z"), registrationDeadline: new Date("2026-04-03T21:59:59Z"), editDeadline: new Date("2026-04-03T21:59:59Z"),
  },
  phase: "RUNNING",
  round: 12,
  finish: { hasTable: true, ready: false, behind: [{ name: "AIK", played: 12 }] },
  archived: 0,
  hero: null,
  previousHeroWithoutConsent: null,
  nextSeasonExists: false,
  teamsCount: 16,
  teams: { status: "ok" },
  playerCount: 400,
  entries: { total: 20, confirmed: 20, claimed: 0, incomplete: 0 },
  bottom: { relegated: ["Örgryte IS", "Halmstad BK"], playoff: "Degerfors IF" },
  ...over,
});
const ids = (g: ReturnType<typeof buildSeasonGuide>) => g.steps.map((s) => `${s.id}:${s.state}`);

describe("säsongsguiden", () => {
  it("mitt i säsongen: inget att göra", () => {
    const g = buildSeasonGuide(base());
    expect(g.mode).toBe("running");
    expect(g.steps).toHaveLength(0);
    expect(g.title).toBe("Omgång 12 av 30");
  });

  it("mitt i säsongen med obekräftade betalningar: bara det steget", () => {
    const g = buildSeasonGuide(base({ entries: { total: 20, confirmed: 18, claimed: 2, incomplete: 0 } }));
    expect(ids(g)).toEqual(["payments:now"]);
  });

  it("efter deadline men före första omgången: väntar", () => {
    expect(buildSeasonGuide(base({ round: 0, finish: { hasTable: false, ready: false, behind: [] } })).mode).toBe("waiting");
  });

  it("alla har spelat klart: avsluta först, resten väntar", () => {
    const g = buildSeasonGuide(base({ round: 30, finish: { hasTable: true, ready: true, behind: [] } }));
    expect(g.mode).toBe("finish");
    expect(ids(g)).toEqual(["finish:now", "archive:todo", "hero:todo", "next:todo"]);
    expect(g.steps[0]!.action?.kind).toBe("finish");
    expect(g.steps.slice(1).every((s) => !s.action || s.action.kind === "link")).toBe(true);
  });

  it("sista omgången klar men en match kvar: avsluta ändå som val", () => {
    const g = buildSeasonGuide(base({ round: 30, finish: { hasTable: true, ready: false, behind: [{ name: "AIK", played: 29 }] } }));
    expect(g.steps[0]).toMatchObject({ id: "finish", state: "warn", action: { kind: "finishForce" } });
    expect(g.steps[0]!.detail).toContain("AIK (29)");
  });

  it("avslutad: arkivera, vinnare och nästa år med knappar – och de bockas av", () => {
    const g = buildSeasonGuide(base({ phase: "FINISHED", round: 30, finish: { hasTable: true, ready: true, behind: [] } }));
    expect(ids(g)).toEqual(["finish:done", "archive:now", "hero:now", "next:now"]);
    expect(g.steps.find((s) => s.id === "next")!.action?.kind).toBe("createNext");
    expect(g.steps.find((s) => s.id === "next")!.detail).toContain("Örgryte IS och Halmstad BK");
    const later = buildSeasonGuide(base({ phase: "FINISHED", round: 30, finish: { hasTable: true, ready: true, behind: [] }, archived: 23, hero: { consent: false }, nextSeasonExists: true }));
    expect(ids(later)).toEqual(["finish:done", "archive:done", "hero:warn", "next:done"]);
    expect(later.summary).toBe("3 av 4 klara.");
  });

  it("inför säsongen: lagbyte föreslås med knapp när ESPN har nya lag", () => {
    const g = buildSeasonGuide(
      base({
        phase: "TIPPING", round: 0, entries: { total: 0, confirmed: 0, claimed: 0, incomplete: 0 },
        teams: { status: "diff", out: [{ id: "t15", name: "Örgryte IS" }, { id: "t16", name: "Halmstad BK" }], in: [
          { espnId: 1, name: "IFK Norrköping", shortName: "IFKN", logo: null, color: null, altColor: null },
          { espnId: 2, name: "Östers IF", shortName: "OIF", logo: null, color: null, altColor: null },
        ] },
      }),
    );
    expect(g.mode).toBe("prepare");
    const teams = g.steps.find((s) => s.id === "teams")!;
    expect(teams).toMatchObject({ state: "warn", action: { kind: "swapTeams", out: ["t15", "t16"], in: ["1", "2"] } });
    expect(g.steps.find((s) => s.id === "invite")!.state).toBe("now");
  });

  it("inför säsongen: ESPN visar ännu förra årets lag – inget förslag, men varning", () => {
    const g = buildSeasonGuide(base({ phase: "TIPPING", teams: { status: "stale" } }));
    expect(g.steps.find((s) => s.id === "teams")).toMatchObject({ state: "warn", action: { kind: "link" } });
  });

  it("inför säsongen: för få spelare och fjolårets vinnare utan samtycke flaggas", () => {
    const g = buildSeasonGuide(base({ phase: "TIPPING", playerCount: 12, previousHeroWithoutConsent: 2026 }));
    expect(g.steps.find((s) => s.id === "players")).toMatchObject({ state: "warn", action: { kind: "syncSquads" } });
    expect(g.steps.find((s) => s.id === "consent")!.title).toContain("2026");
  });

  it("inför säsongen när allt är klart: lugnt läge", () => {
    const g = buildSeasonGuide(base({ phase: "TIPPING", entries: { total: 20, confirmed: 20, claimed: 0, incomplete: 0 } }));
    expect(g.steps.filter((s) => s.state === "warn" || s.state === "now")).toHaveLength(0);
    expect(g.summary).toBe("Allt är klart. Resten sker automatiskt.");
  });
});

describe("nästa års tävling", () => {
  it("flyttar datum ett år med samma svenska klockslag, även över sommartid", () => {
    expect(plusOneYear(new Date("2026-04-03T21:59:59.999Z"))).toBe("2027-04-03T23:59");
    expect(plusOneYear(new Date("2026-03-28T22:59:00Z"))).toBe("2027-03-28T23:59");
  });
  it("29 februari blir 28 februari", () => {
    expect(plusOneYear(new Date("2028-02-29T11:00:00Z"))).toBe("2029-02-28T12:00");
  });
  it("byter årtalet i namnet", () => {
    expect(nextName("Tips Allsvenskan 2026", 2026)).toBe("Tips Allsvenskan 2027");
    expect(nextName("Kompistipset", 2026)).toBe("Kompistipset 2027");
  });
});
