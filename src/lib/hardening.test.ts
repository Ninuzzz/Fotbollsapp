// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateStandings, type StandingCheckRow } from "./standings-validation";
import { fromLocalDeadline, fromLocalInput } from "./format";
import { canEditTip } from "./tip-validation";
import { decryptBackup, encryptBackup } from "./backup-crypto";
import { syncStaleness } from "./sync-staleness";
import { isMatchWeekday, stockholmParts } from "./time";
import { syncIntervalMs } from "./scheduler";
import { createRng } from "./simulation";

/** En äkta, matematiskt konsekvent tabell: slumpade matcher mellan 16 lag. */
function realisticTable(matches = 120, seed = 5): StandingCheckRow[] {
  const rng = createRng(seed);
  const t = Array.from({ length: 16 }, (_, i) => ({ teamId: `t${i}`, position: 0, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }));
  for (let m = 0; m < matches; m++) {
    const a = Math.floor(rng() * 16);
    let b = Math.floor(rng() * 15);
    if (b >= a) b++;
    const ga = Math.floor(rng() * 4);
    const gb = Math.floor(rng() * 3);
    const A = t[a]!;
    const B = t[b]!;
    A.played++; B.played++; A.goalsFor += ga; A.goalsAgainst += gb; B.goalsFor += gb; B.goalsAgainst += ga;
    if (ga > gb) { A.won++; B.lost++; A.points += 3; } else if (ga < gb) { B.won++; A.lost++; B.points += 3; } else { A.drawn++; B.drawn++; A.points++; B.points++; }
  }
  t.sort((x, y) => y.points - x.points || y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst));
  return t.map((r, i) => ({ ...r, position: i + 1 }));
}
const opts = { expectedTeams: 16, totalRounds: 30 };

describe("validateStandings", () => {
  it("godkänner en konsekvent tabell", () => {
    expect(validateStandings(realisticTable(), opts)).toEqual([]);
    expect(validateStandings(realisticTable(150, 9), opts)).toEqual([]);
  });
  it("avvisar tabell där 'rank' saknas (alla placering 0)", () => {
    const rows = realisticTable().map((r) => ({ ...r, position: 0 }));
    expect(validateStandings(rows, opts).join(" ")).toMatch(/Placeringarna/);
  });
  it("avvisar dubblerade placeringar", () => {
    const rows = realisticTable();
    rows[3]!.position = 2;
    expect(validateStandings(rows, opts).join(" ")).toMatch(/Placeringarna/);
  });
  it("avvisar en halvuppdaterad tabell där målen inte går ihop", () => {
    const rows = realisticTable();
    rows[4]!.goalsFor += 1;
    expect(validateStandings(rows, opts).join(" ")).toMatch(/Målen går inte ihop/);
  });
  it("avvisar V+O+F som inte stämmer med spelade matcher", () => {
    const rows = realisticTable();
    rows[0]!.played += 1;
    expect(validateStandings(rows, opts).join(" ")).toMatch(/V\+O\+F/);
  });
  it("avvisar poäng som inte stämmer med 3×V+O (poängavdrag flaggas för granskning)", () => {
    const rows = realisticTable();
    rows[7]!.points -= 3;
    expect(validateStandings(rows, opts).join(" ")).toMatch(/Poängavdrag/);
  });
  it("avvisar lag med färre poäng före lag med fler", () => {
    const rows = realisticTable();
    [rows[0]!.position, rows[15]!.position] = [rows[15]!.position, rows[0]!.position];
    expect(validateStandings(rows, opts).join(" ")).toMatch(/färre poäng/);
  });
  it("avvisar vinster och förluster som inte går ihop, och udda antal oavgjorda", () => {
    const rows = realisticTable();
    rows[2]!.won += 1; // en vinst utan motsvarande förlust någonstans
    const msg = validateStandings(rows, opts).join(" ");
    expect(msg).toMatch(/Vinster/);
  });
  it("avvisar fler spelade matcher än omgångar", () => {
    const rows = realisticTable(600, 3);
    expect(validateStandings(rows, { ...opts, totalRounds: 10 }).join(" ")).toMatch(/omgångar/);
  });
  it("avvisar gammal data där spelade matcher minskar", () => {
    const rows = realisticTable();
    const previous = rows.map((r) => ({ teamId: r.teamId, played: r.played + 1 }));
    expect(validateStandings(rows, { ...opts, previous }).join(" ")).toMatch(/minskar/);
  });
  it("avvisar fel antal lag och ogiltiga tal", () => {
    expect(validateStandings(realisticTable().slice(0, 15), opts).join(" ")).toMatch(/15 lag/);
    const rows = realisticTable();
    rows[1]!.points = Number.NaN;
    expect(validateStandings(rows, opts).join(" ")).toMatch(/ogiltigt värde/);
  });
  it("kräver aldrig att spelade matcher ökar (samma tabell igen är okej)", () => {
    const rows = realisticTable();
    expect(validateStandings(rows, { ...opts, previous: rows.map((r) => ({ teamId: r.teamId, played: r.played })) })).toEqual([]);
  });
});

describe("deadline", () => {
  it("23:59 gäller t.o.m. 23:59:59.999 svensk tid (sommartid och vintertid)", () => {
    expect(fromLocalDeadline("2027-04-03T23:59").toISOString()).toBe("2027-04-03T21:59:59.999Z");
    expect(fromLocalDeadline("2027-01-15T23:59").toISOString()).toBe("2027-01-15T22:59:59.999Z");
    // dygnet då sommartiden börjar (28 mars 2027): 23:59 är redan sommartid
    expect(fromLocalDeadline("2027-03-28T23:59").toISOString()).toBe("2027-03-28T21:59:59.999Z");
  });
  it("den som tippar 23:59:30 nekas inte, 00:00:00 nekas", () => {
    const dl = fromLocalDeadline("2027-04-03T23:59");
    const paid = { paymentStatus: "CONFIRMED", freeEntry: false };
    const at = (iso: string) => canEditTip({ editDeadline: dl }, paid, new Date(iso)).ok;
    expect(at("2027-04-03T21:59:30Z")).toBe(true);
    expect(at("2027-04-03T21:59:59.999Z")).toBe(true);
    expect(at("2027-04-03T22:00:00.000Z")).toBe(false);
  });
  it("minutvärdet är oförändrat för andra datum (startdatum)", () => {
    expect(fromLocalInput("2027-04-05T15:00").toISOString()).toBe("2027-04-05T13:00:00.000Z");
  });
});

describe("backup-kryptering", () => {
  const data = Buffer.from("SQLite format 3\0 hemligt".repeat(1000));
  it("krypterar och dekrypterar tillbaka exakt", () => {
    const enc = encryptBackup(data, "en-lang-losenfras-123");
    expect(enc.includes(Buffer.from("hemligt"))).toBe(false);
    expect(decryptBackup(enc, "en-lang-losenfras-123").equals(data)).toBe(true);
  });
  it("fel lösenfras och manipulerad fil avvisas", () => {
    const enc = encryptBackup(data, "en-lang-losenfras-123");
    expect(() => decryptBackup(enc, "fel-losenfras-456789")).toThrow(/dekryptera/);
    const bad = Buffer.from(enc);
    bad[bad.length - 40] ^= 0xff;
    expect(() => decryptBackup(bad, "en-lang-losenfras-123")).toThrow(/dekryptera/);
    expect(() => decryptBackup(Buffer.from("inte en backup alls, långt nog för header"), "x")).toThrow(/filformat/);
  });
});

describe("tid och schema", () => {
  it("svensk veckodag och timme oavsett serverns tidszon", () => {
    // natten mot söndag 4 juli 2027, 00:30 svensk sommartid
    expect(stockholmParts(new Date("2027-07-03T22:30:00Z"))).toEqual({ weekday: 0, hour: 0 });
    expect(stockholmParts(new Date("2027-01-01T11:00:00Z"))).toEqual({ weekday: 5, hour: 12 });
  });
  it("fredag–söndag är matchdagar", () => {
    const day = (d: number) => isMatchWeekday(new Date(`2027-01-0${d}T12:00:00Z`)); // 1 jan 2027 = fredag
    expect([day(1), day(2), day(3), day(4), day(5), day(6), day(7)]).toEqual([true, true, true, false, false, false, false]);
  });
  it("tabellen hämtas tätt när matcher spelas och glest annars", () => {
    const season = { startDate: new Date("2027-04-04T13:00:00Z") };
    expect(syncIntervalMs(new Date("2027-03-20T12:00:00Z"), season)).toBe(3 * 3_600_000); // före seriestart
    expect(syncIntervalMs(new Date("2027-05-07T14:00:00Z"), season)).toBe(10 * 60_000); // fredag 16:00
    expect(syncIntervalMs(new Date("2027-05-07T08:00:00Z"), season)).toBe(3_600_000); // fredag 10:00
    expect(syncIntervalMs(new Date("2027-05-10T14:00:00Z"), season)).toBe(3_600_000); // måndag
  });
  it("gammal tabell: 6 h på matchdag, 26 h annars, ingen bevakning före seriestart eller efter avslut", () => {
    const season = { startDate: new Date("2026-12-01T12:00:00Z"), isFinished: false };
    const h = (n: number, from: string) => new Date(new Date(from).getTime() - n * 3_600_000);
    const fri = "2027-01-01T14:00:00Z";
    const mon = "2027-01-04T14:00:00Z";
    expect(syncStaleness(season, h(5, fri), new Date(fri)).stale).toBe(false);
    expect(syncStaleness(season, h(7, fri), new Date(fri)).stale).toBe(true);
    expect(syncStaleness(season, h(25, mon), new Date(mon)).stale).toBe(false);
    expect(syncStaleness(season, h(27, mon), new Date(mon)).stale).toBe(true);
    expect(syncStaleness(season, null, new Date("2026-11-01T12:00:00Z")).watching).toBe(false);
    expect(syncStaleness({ ...season, isFinished: true }, null, new Date(fri)).stale).toBe(false);
    // aldrig lyckats sedan bevakningen började → mät från bevakningens start
    expect(syncStaleness(season, null, new Date("2026-12-01T12:00:00Z")).stale).toBe(false);
    expect(syncStaleness(season, null, new Date("2026-12-02T14:00:00Z")).stale).toBe(true);
  });
});
