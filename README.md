# Allsvenskantipset

Webbapp för kompisgängets tips på Allsvenskans sluttabell – sedan 2015. Minst antal fel vinner muggen, vandringspriset och potten.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Prisma + SQLite · Motion (animeringar) · Recharts · Web Push · dnd-kit

## Kom igång

```bash
npm install
cp .env.example .env          # fyll i värden (se nedan)
npx prisma db push            # skapar databasen (SQLite-fil)
npm run db:seed               # lag, säsong 2026, Hall of Fame, historik 2024 + demodata
npm run dev                   # http://localhost:3000
```

Testkonton efter seed (endast lokalt): `anders@allsvenskantipset.se` (admin, lösenord = `SEED_ADMIN_PASSWORD`, default i `prisma/seed.ts`) och `demo@allsvenskantipset.se`.

Tester: `npm test` (poäng, tie-breakers, prispott, utmärkelser, tipsvalidering).

## Funktioner

| Område | Vad |
| --- | --- |
| Registrering | 4 steg: konto → favoritlag → avatar (tröja eller egen bild) → Swish 111 kr (QR + app-länk, "någon annan swishar" med namn/initialer). Admin bekräftar betalningen. |
| Tipsa | 16 lag med dra-och-släpp eller rullista, röda fält vid dubbletter, utslagsfrågor (skytt + assistkung), odds från spelbolag, "fyll i enligt oddsen". Låses automatiskt vid deadline (kontrolleras på servern). |
| Min sida | Lagets färger + emblem + stjärnspelare, placering, fel, exakta, prognos på pris, fel per lag mot verkliga tabellen, tie-breaker-läge, egen trendgraf. |
| Tipstabellen | Live-rankning, pilar upp/ner, "avgjort på skytteligan", prisplatser, följ tippare ("mitt gäng"), toppgänget, trendgrafer (placering/fel), veckans raket/djupdykning/jojo. Allas tips blir synliga efter deadline. |
| Allsvenskan | Verklig tabell med officiella logotyper + din tippade placering, skytte- och assistliga med spelarfoton. |
| Chatt | Endast betalande spelare, emojis, moderering (admin kan ta bort). |
| Notiser | Push (Web Push/PWA) + inkorg med all historik. Välj själv: deadline, resultat, utmärkelser, nyheter, chatt. |
| Nyheter | Anders egna inlägg + Allsvenskan-nyheter från publikt RSS (Google News). |
| Heroes | Mästarväggen med bilder, flest titlar, rekord, kapplöpningen 2024 omgång för omgång, all-time-tabell (Total Score). |
| Admin (Anders) | Tävlingar (datum, insats, pott, återanvänd lag från tidigare år), deltagare (bekräfta Swish, gratisplats, roller), tabell manuellt, lagbank, spelare/mål/assist, utskick med text + bild + push till målgrupp, odds, Heroes + import av historik, synk-knappar, rensa demodata. |

## Automatisk data (så att Anders slipper mata in)

| Data | Källa | Nyckel |
| --- | --- | --- |
| Tabell + laglogotyper | ESPN:s publika API (`swe.1`) | Nej |
| Skytte- och assistliga (topp 50) | ESPN | Nej |
| Trupper (spelare att tippa) | ESPN | Nej |
| Spelarfoton | TheSportsDB (exakt namnmatchning så att fel person aldrig visas) | Nej (publik testnyckel) |
| Alternativ källa | API-Football – `FOOTBALL_PROVIDER=api-football` + `API_FOOTBALL_KEY` | Ja. Faller tillbaka till ESPN vid fel. Obs: gratisnivån har historiskt bara täckt äldre säsonger – testa med knappen i Admin. |
| Odds | The Odds API (`ODDS_API_KEY`) eller manuellt i Admin → Odds | Valfri |
| Nyheter | Google News RSS (`NEWS_FEEDS` för egna flöden) | Nej |

Om en källa fallerar: Admin → Tabell / Spelare för manuell inmatning. Tipstabellen räknas om och utmärkelser koras vid varje uppdatering.

### Schemalagda jobb

Servern kör själv synk, påminnelser och nyheter varje timme (inbyggd schemaläggare). Extern cron behövs bara om du stänger av den:

```bash
# varje timme (synk – sparar bara ny tabell om något ändrats)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domän>/api/cron?job=sync
# dagligen (deadline-påminnelser 7, 3 och 1 dag innan, till de som saknar tips)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domän>/api/cron?job=reminders
```

## Regler i koden

- `src/lib/scoring.ts`: fel = Σ |tippad − verklig| per lag. Tie-breakers: 1) mål av tippad skytt, 2) assist av tippad assistkung, 3) flest exakta, 4) delad placering.
- `src/lib/prizes.ts`: pott = betalande × insats − avsatt (600 kr till mugg, vandringspris och tröstpris, precis som i Excel-regeln "Det är avsatt 600 kr av potten…"). Resten 50/30/20. Delade placeringar delar summan av de prisplatser de täcker, vilket ger exakt finstilta reglerna.
- `src/lib/awards.ts`: raket (flest placeringar upp), djupdykning (flest ner), jojo (mest upp och ner de senaste uppdateringarna).

## GDPR

- **Integritetspolicy** på `/integritet`. Samtycke är obligatoriskt vid registreringen och sparas med tidsstämpel (`privacyAcceptedAt`).
- **Rätten att bli glömd:** under Profil → Dina uppgifter raderar användaren själv sitt konto och all identifierbar data. Det gäller konto, tips, deltaganden, chatt, följningar, pushprenumerationer och historik. Ett eventuellt Hall of Fame-inlägg döljs. Lösenord och ordet "RADERA" krävs. Enda admin kan inte radera sig själv.
- **Rätt till tillgång:** "Ladda ner mina uppgifter" ger en JSON-fil via `/api/me/export`. Lösenordshashen ingår aldrig.
- **Heroes kräver samtycke:** namn och bild visas publikt först när admin bockat i "Vinnaren har gett samtycke" (Admin → Heroes). Utan samtycke visas bara årtalet. Seeden sätter samtycke till *nej*; kör `SEED_HEROES_CONSENT=true` först när samtycken finns.
- **Integritet som standard:** utloggade besökare ser bara initialer och standardavatarer. All-time-tabellen, kapplöpningen och enskilda tips kräver inloggning.
- Inga spårningscookies, bara en nödvändig sessionscookie, så ingen cookie-banner behövs.

## Betalningsflöde (Swish)

1. Spelaren registrerar sig och anger om hen swishat, om någon annan swishat (namn/initialer) eller om hen swishar senare.
2. Anders får en notis ("Ny deltagare …" / "… har swishat") och ser listan under Admin → Deltagare → *Väntar på bekräftelse*.
3. Tills Anders tryckt **Bekräfta betalning** möts spelaren av *Väntar på betalningsbekräftelse* på tipssidan och i chatten. Servern nekar också att spara tips (`canEditTip`), så spärren går inte att kringgå med en direkt POST.
4. När betalningen bekräftas får spelaren en notis och kan tippa.

Swish Handel-API (automatisk avprickning) kräver företagsavtal och kostar per transaktion, så den manuella avprickningen är vald.

## Säkerhet

- Lösenord hashas med bcrypt, minst 10 tecken med bokstäver och siffror. Sessionstoken lagras hashad (SHA-256) i en httpOnly-, SameSite=Lax- och Secure-cookie.
- Rate limiting på inloggning (per IP och konto), registrering, chatt, tips, profil och lösenordsbyte. Svarstiden vid inloggning är konstant, så den avslöjar inte om ett konto finns.
- Varje admin-åtgärd kontrollerar rollen på servern. Server Actions är publika endpoints och skyddas därför var för sig.
- CSRF: Server Actions har Next.js inbyggda origin-kontroll. API-routes kräver att Origin matchar.
- Strikt CSP med nonce och `strict-dynamic` (inga inline-skript), X-Frame-Options DENY, HSTS, nosniff, Referrer- och Permissions-Policy.
- **XSS:** användartext (chatt, namn) saneras på servern (`src/lib/sanitize.ts`: kontrolltecken, zero-width- och bidi-tecken tas bort) och sparas som ren text, aldrig HTML. React escapar vid rendering, och appen använder aldrig `dangerouslySetInnerHTML` med användarinnehåll. Den strikta CSP:n blockerar inline-skript som sista skydd. Tester i `src/lib/security.test.ts` visar att `<script>`, `onerror` och `javascript:` renderas som text.
- **Deadline på servern:** `canEditTip` kontrolleras i varje `saveTip`, oavsett vad UI:t visar (testat).
- **Caching:** externa API:er (ESPN, TheSportsDB, RSS) anropas aldrig per sidvisning. En inbyggd schemaläggare (`src/instrumentation.ts` → `src/lib/scheduler.ts`) hämtar varje timme och sparar i databasen, och sidorna läser därifrån. Nyheterna har dessutom en timcache i databasen. Stäng av med `INTERNAL_SCHEDULER=false` och använd `/api/cron?job=all` från extern cron om du kör flera instanser.
- All input valideras med zod. Bilder tillåts bara som små PNG-, JPEG- eller WebP-data-URL:er eller http(s)-länkar, vilket blockerar `javascript:`-URL:er. React escapar allt användarinnehåll.
- Tips är hemliga före deadline. Deadline och betalstatus kontrolleras alltid på servern.
- Cron-endpointen kräver `CRON_SECRET` (minst 16 tecken) och jämförs i konstant tid.
- `npm audit`: 0 sårbarheter (postcss och deepmerge-ts är lyfta via `overrides`).

## Driftsättning (t.ex. Fly.io)

1. `fly launch` → lägg SQLite på en volym: `DATABASE_URL="file:/data/tipset.db"`.
2. `fly secrets set` för alla värden i `.env.example`. Generera nya VAPID-nycklar med `npm run vapid` och en lång `CRON_SECRET`.
3. `npx prisma db push && npm run db:seed` första gången. Rensa sedan demodata i Admin → Översikt.
4. Lägg upp cron-anropen ovan, t.ex. som schemalagd GitHub Action eller Fly Machine.

För större drift: byt `provider` till `postgresql` i `prisma/schema.prisma` och rate limitern mot Redis.

## Att kontrollera

- **Hall of Fame-bilderna 2024 och 2025** (`private/heroes/2024.png` och `2025.png`, serveras bara vid samtycke) är mappade till Ulf Carlsson och Johan Åhlander i den ordning bilderna kom. Byt i Admin → Heroes om det är fel.
- 2024 års data (33 tippare, placering per omgång) är importerad från `Allsvenskantips 2025.xlsx` (flikarna omg1–30). Äldre år kan klistras in i Admin → Heroes.
- Demotippare, tabellhistorik före omgång 22, chatt och odds är exempeldata. Tabellen efter omgång 22 samt skytte- och assistligan är riktiga (ESPN).
