// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { escapeHtml, sanitizeText } from "./sanitize";
import { canEditTip } from "./tip-validation";

describe("XSS-skydd i chatten", () => {
  const attacks = [
    "<script>alert(document.cookie)</script>",
    '<img src=x onerror="fetch(\'//evil\')">',
    "<a href=\"javascript:alert(1)\">klick</a>",
    "</p><svg onload=alert(1)>",
  ];
  it.each(attacks)("renderas som ofarlig text: %s", (attack) => {
    const html = renderToStaticMarkup(createElement("p", null, sanitizeText(attack)));
    expect(html).not.toMatch(/<script|<img|<svg|<a /i);
    expect(html).toContain("&lt;");
  });
  it("tar bort osynliga tecken och bidi-overrides", () => {
    expect(sanitizeText("he​j‮ dolt\u0007")).toBe("hej dolt");
  });
  it("behåller emojis och svenska tecken", () => {
    expect(sanitizeText("Åäö ⚽🚀 💚🤍")).toBe("Åäö ⚽🚀 💚🤍");
  });
  it("begränsar längd", () => {
    expect(sanitizeText("x".repeat(5000))).toHaveLength(1000);
  });
  it("escapeHtml", () => {
    expect(escapeHtml(`<b onclick="x">'&'</b>`)).toBe("&lt;b onclick=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/b&gt;");
  });
});

describe("tips kan bara sparas före deadline och efter betalning", () => {
  const season = { editDeadline: new Date("2026-04-03T21:59:00Z") };
  const paid = { paymentStatus: "CONFIRMED", freeEntry: false };
  it("tillåter betald spelare före deadline", () => {
    expect(canEditTip(season, paid, new Date("2026-04-01T12:00:00Z")).ok).toBe(true);
  });
  it("nekar efter deadline – även om någon skickar en POST direkt", () => {
    expect(canEditTip(season, paid, new Date("2026-04-03T22:00:00Z"))).toEqual({ ok: false, reason: "DEADLINE" });
  });
  it("nekar obetald spelare", () => {
    expect(canEditTip(season, { paymentStatus: "CLAIMED", freeEntry: false }, new Date("2026-04-01T12:00:00Z"))).toEqual({
      ok: false,
      reason: "UNPAID",
    });
    expect(canEditTip(season, null, new Date("2026-04-01T12:00:00Z")).ok).toBe(false);
  });
  it("gratisplats räknas som betald", () => {
    expect(canEditTip(season, { paymentStatus: "PENDING", freeEntry: true }, new Date("2026-04-01T12:00:00Z")).ok).toBe(true);
  });
});
