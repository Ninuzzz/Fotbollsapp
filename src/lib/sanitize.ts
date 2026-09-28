/**
 * Sanering av användartext (chatt, namn, utskick).
 *
 * Försvar mot XSS i tre lager:
 *  1. Här: text normaliseras och osynliga/farliga tecken tas bort innan den sparas.
 *     Vi lagrar alltid ren TEXT – aldrig HTML.
 *  2. Vid rendering: React escapar all text (`{message.body}`), så `<script>` blir bokstäver,
 *     inte kod. Appen använder aldrig dangerouslySetInnerHTML med användarinnehåll.
 *  3. I webbläsaren: strikt Content-Security-Policy med nonce (middleware.ts) blockerar
 *     inline-skript även om något skulle slinka igenom.
 */

// Kontrolltecken (utom radbrytning/tab), zero-width-tecken och bidi-overrides som kan
// användas för att dölja eller spegla text ("Trojan Source"-trick).
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export function sanitizeText(input: string, { maxLength = 1000, multiline = true } = {}): string {
  let s = input.normalize("NFC").replace(INVISIBLE, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, maxLength);
}

/** Escapar HTML – används där text hamnar utanför React (t.ex. e-post eller push-payload i HTML-kontext). */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
