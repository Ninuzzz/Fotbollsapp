/**
 * Omdirigering efter inloggning: bara interna sökvägar. "/\evil.com" normaliseras av webbläsaren till
 * "//evil.com", så backslash och blanktecken nekas, och adressen måste stanna på vår egen origin.
 */
export function safeNext(next: string, fallback = "/min-sida"): string {
  // Backslash, blanktecken och kontrolltecken (t.ex. tab) används för att lura webbläsarens URL-tolkning
  if (!next.startsWith("/") || /[\\\s\u0000-\u001f]/.test(next)) return fallback;
  try {
    const u = new URL(next, "http://intern.invalid");
    if (u.origin !== "http://intern.invalid") return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
