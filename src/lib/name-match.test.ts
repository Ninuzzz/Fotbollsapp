import { describe, expect, it } from "vitest";
import { coreTeamName, isSeniorMenTeam, matchPlayerName } from "./name-match";

describe("lagnamn mellan källor", () => {
  it.each([
    ["Hammarby IF", "Hammarby FF"],
    ["IFK Göteborg", "IFK Goteborg"],
    ["Halmstad BK", "Halmstads BK"],
    ["Djurgårdens IF", "Djurgardens IF"],
    ["Mjällby AIF", "Mjallby AIF"],
    ["BK Häcken", "Hacken"],
    ["Västerås SK", "Vasteras SK FK"],
  ])("%s = %s", (ours, api) => expect(coreTeamName(ours)).toBe(coreTeamName(api)));

  it("skiljer på olika klubbar", () => {
    expect(coreTeamName("IFK Göteborg")).not.toBe(coreTeamName("GAIS"));
    expect(coreTeamName("Malmö FF")).not.toBe(coreTeamName("Kalmar FF"));
  });

  it("hoppar över dam- och ungdomslag", () => {
    expect(isSeniorMenTeam("Hammarby FF")).toBe(true);
    expect(isSeniorMenTeam("Hammarby W")).toBe(false);
    expect(isSeniorMenTeam("Hammarby U21")).toBe(false);
  });
});

describe("spelarnamn", () => {
  const squad = [{ name: "Victor Eriksson" }, { name: "Frank Junior Adjei" }, { name: "Oskar Steinke Branby" }, { name: "Ibrahima Fofana" }];
  it.each([
    ["V. Eriksson", "Victor Eriksson"],
    ["F. Adjei", "Frank Junior Adjei"],
    ["O. Steinke Branby", "Oskar Steinke Branby"],
    ["Ibrahima Fofana", "Ibrahima Fofana"],
  ])("%s → %s", (api, ours) => expect(matchPlayerName(api, squad)?.name).toBe(ours));

  it("ger ingen träff hellre än fel foto", () => {
    expect(matchPlayerName("A. Eriksson", squad)).toBeUndefined();
    expect(matchPlayerName("V. Eriksson", [...squad, { name: "Viktor Eriksson" }])).toBeUndefined();
  });
});

describe("lag med kortare namn hos oss", () => {
  it("AIK matchar AIK Stockholm via prefix", () => {
    const ours = coreTeamName("AIK");
    const api = coreTeamName("AIK Stockholm");
    expect(api.startsWith(`${ours} `)).toBe(true);
  });
});
