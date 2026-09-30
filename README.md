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

Tester: `npm test` (poäng, tie-breakers, prispott, utmärkelser, tipsvalidering, tabellkontroller, deadline, backup-kryptering, tidsstyrning) och `npm run verify:season`, som spelar en hel påhittad säsong mot en egen testdatabas (`prisma/verify-season.db`) och kontrollerar tippning med styrbar klocka (deadline på millisekunden), förra årets tabell, notiser per omgång, uppskjutna matcher, misstänkta tabeller i karantän, samtidiga synkar, krasch mitt i skrivning, säsongsavslut och frysning, backup, övervakning, prispott, gratisplats och demodata. Kör båda innan du driftsätter en ändring. Rutiner för drift, backup och återställning: [docs/DRIFT.md](docs/DRIFT.md).

**Säsongens gång:** skapa nästa års tävling under Admin → Tävlingar – den blir aktiv direkt och trupperna hämtas. Resten sker automatiskt: påminnelser före deadline (dagtid), tabell var 10:e minut på matchdagar och annars varje timme när serien startat (aldrig förra årets), en notis per färdigspelad omgång, en påminnelse till admin när **alla** lag har spelat sista omgången, och besked till alla med vinnarna när admin trycker Avsluta säsong. Avslutet kräver att alla lag spelat klart, fastställer slutresultatet och fryser säsongen. Fjolårets sistaplats får gratisplats när hen går med.

**Demoläge:** Admin → Översikt → Läs in demodata / Rensa demodata. Demotippare är markerade (`User.isDemo`) och rensning rör aldrig riktiga konton. Demodata går att läsa in så länge bara administratörer har anmält sig till tävlingen (deras egna deltaganden rörs aldrig och visas bredvid demotipparna). Så fort en vanlig deltagare finns nekas det, och är en vanlig deltagare bekräftad räknas demotipparna bort ur tabell och prispott. Demoflaggan håller inte anmälan öppen efter sista anmälningsdag i drift.

## Funktioner

| Område | Vad |
| --- | --- |
| Registrering | 4 steg: konto → favoritlag → avatar (tröja eller egen bild) → Swish 111 kr (QR + app-länk, "någon annan swishar" med namn/initialer). Admin bekräftar betalningen. |
| Tipsa | 16 lag med dra-och-släpp eller rullista, röda fält vid dubbletter, utslagsfrågor (skytt + assistkung), odds från spelbolag, "fyll i enligt oddsen". Låses automatiskt vid deadline (kontrolleras på servern, och igen precis före skrivning). Deadline gäller t.o.m. den angivna minuten: 23:59 betyder 23:59:59. |
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
| Reservkälla | API-Football – `API_FOOTBALL_KEY` (används när ESPN är nere eller ger en tabell som inte klarar kontrollerna; `FOOTBALL_PROVIDER=api-football` vänder på ordningen) | Ja. Obs: gratisnivån har historiskt bara täckt äldre säsonger – testa med knappen i Admin. |
| Odds | The Odds API (`ODDS_API_KEY`) eller manuellt i Admin → Odds | Valfri |
| Nyheter | Google News RSS (`NEWS_FEEDS` för egna flöden) | Nej |

Om en källa fallerar: Admin får en notis (efter 6 timmar fredag–söndag, 26 timmar annars) och kan mata in tabellen manuellt under Admin → Tabell (förifylld, med kontroller) och spelare under Admin → Spelare. Tipstabellen räknas om och utmärkelser koras vid varje uppdatering. En hämtad tabell som inte klarar kontrollerna (t.ex. saknade placeringar eller mål som inte går ihop) publiceras inte utan hamnar i karantän för admin att godkänna eller avvisa.

### Schemalagda jobb

Servern kör själv synk, backup, påminnelser och nyheter (inbyggd schemaläggare som tickar var 5:e minut: tabell var 10:e minut fredag–söndag kl 12–24, annars varje timme). Extern cron behövs bara om du stänger av den, och är annars ett andra, oberoende hjärtslag:

```bash
# var 10:e–30:e minut (synk – sparar bara ny tabell om något ändrats)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domän>/api/cron?job=sync
# dagligen (deadline-påminnelser 7, 3 och 1 dag innan, till de som saknar tips)
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domän>/api/cron?job=reminders
```

## Regler i koden

- `src/lib/scoring.ts`: fel = Σ |tippad − verklig| per lag. Tie-breakers: 1) mål av tippad skytt, 2) assist av tippad assistkung, 3) flest exakta, 4) delad placering.
- `src/lib/prizes.ts` (beloppen avrundas nedåt till hela kronor, och kronor som blir över visas som "Ej utdelat"): pott = betalande × insats − avsatt (600 kr till mugg, vandringspris och tröstpris, precis som i Excel-regeln "Det är avsatt 600 kr av potten…"). Resten 50/30/20. Delade placeringar delar summan av de prisplatser de täcker, vilket ger exakt finstilta reglerna.
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
- **Tabellkontroll:** varje tabell (API eller manuell) kontrolleras före den sparas (`src/lib/standings-validation.ts`): placeringar, V+O+F = spelade, poäng = 3×V+O, mål gjorda = insläppta, vinster = förluster, spelade matcher minskar aldrig. Misstänkta tabeller publiceras inte.
- **Atomär skrivning och lås:** en ny tabell och dess tipstabell sparas i en transaktion under ett lås, så samtidiga synkar och krascher aldrig ger dubbletter eller halva tabeller.
- **Avslut:** kräver att alla lag spelat klart, fastställer och fryser slutresultatet. Backup tas före.
- **Backup:** kontrollerade kopior (`VACUUM INTO` + integritetskontroll) nattligen och runt deadline, samt krypterad nedladdning (`/api/backup`, AES-256-GCM) för off-site-lagring.
- `npm audit`: 0 sårbarheter (postcss och deepmerge-ts är lyfta via `overrides`).

## Driftsätt din egen kopia på Fly.io

Allt som behövs finns i repot: `Dockerfile`, `fly.toml`, spelarfoton (`public/players`) och vinnarbilder (`private/heroes`). Räkna med ungefär 30 minuter första gången och 3–5 dollar i månaden.

**Förberedelser (en gång):** installera [Node.js 22](https://nodejs.org), [Git](https://git-scm.com) och [flyctl](https://fly.io/docs/flyctl/install/), och skapa ett konto på fly.io.

1. **Klona och testa lokalt**
   ```bash
   git clone https://github.com/Ninuzzz/Fotbollsapp.git
   cd Fotbollsapp
   npm install
   cp .env.example .env
   npx prisma db push
   npm run db:seed
   npm run dev
   ```
   Öppna http://localhost:3000 och logga in som `anders@allsvenskantipset.se` (lokalt lösenord: se `prisma/seed.ts`).
2. **Välj ett eget appnamn.** Namn hos Fly är unika, så byt `app = "allsvenskantipset"` i `fly.toml` till t.ex. `app = "tipset-anders"`. Sajten hamnar på `https://<appnamn>.fly.dev`.
3. **Skapa appen och disken för databasen**
   ```bash
   fly auth login
   fly apps create tipset-anders
   fly volumes create tipset_data --region arn --size 1 --app tipset-anders
   ```
4. **Egna nycklar för pushnotiser.** Kör `npm run vapid`. Lägg den publika nyckeln (`publicKey`) i `fly.toml` under `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, och resten som hemligheter (skriv in dem själv i terminalen):
   ```bash
   fly secrets set VAPID_PRIVATE_KEY=<privateKey> CRON_SECRET=<lång slumpsträng> VAPID_SUBJECT=mailto:<din e-post> SEED_ADMIN_PASSWORD=<minst 12 tecken> --app tipset-anders
   ```
   Valfritt, för fler spelarfoton: `fly secrets set FOOTBALL_PROVIDER=api-football API_FOOTBALL_KEY=<nyckel> --app tipset-anders`.
5. **Deploya** (bygget sker hos Fly, ungefär 4 minuter):
   ```bash
   fly deploy --app tipset-anders
   ```
6. **Fyll databasen** – en gång, när deployen är klar:
   ```bash
   fly ssh console --app tipset-anders -C "npx tsx prisma/seed.ts"
   ```
   Seeden vägrar köra om databasen redan har användare, så den kan inte radera riktig data av misstag.
7. **Logga in** på `https://<appnamn>.fly.dev/logga-in` med lösenordet från `SEED_ADMIN_PASSWORD`, byt det under Profil, och följ checklistan i [docs/Guide-for-Anders.pdf](docs/Guide-for-Anders.pdf). Ta sedan bort startlösenordet: `fly secrets unset SEED_ADMIN_PASSWORD --app tipset-anders`.

**Göra egna ändringar:** ändra koden, testa med `npm run dev` och `npm test`, och kör `fly deploy` igen. Databasen ligger på disken och påverkas inte av nya deployer. Schemaändringar i `prisma/schema.prisma` förs in automatiskt vid start (ändringar som skulle radera data vägras).

**Bra att veta om driften**
- Tabell, ligor och nyheter hämtas av en inbyggd schemaläggare – inga cron-jobb behövs.
- Backup: appen tar själv kontrollerade kopior (nattligen, runt deadline, vid omstart) på disken, och Fly tar dagliga ögonblicksbilder (`fly volumes snapshots list <volym-id>`). Aktivera dessutom den krypterade off-site-backupen och övervakningen, och öva återställning: se [docs/DRIFT.md](docs/DRIFT.md). Admin → Översikt → Go-live-kontroll visar vad som återstår.
- Hälsokontroll: `/api/health` (databas) och `/api/health?strict=1` (även tabellens ålder), lämpliga för UptimeRobot.
- Glömt adminlösenordet: `fly ssh console --app tipset-anders -C "env NEW_PASSWORD=<nytt lösenord> npx tsx prisma/set-password.ts anders@allsvenskantipset.se"`.
- Loggar: `fly logs --app tipset-anders`. Starta om: `fly apps restart tipset-anders`.
- Spelarfotona i repot kopplas in automatiskt av seeden. Efter att trupper hämtats om: `fly ssh console -C "npm run photos:apply"`.

För större drift: byt `provider` till `postgresql` i `prisma/schema.prisma` och rate limitern mot Redis.

## Att kontrollera

- **Hall of Fame-bilderna 2024 och 2025** (`private/heroes/2024.png` och `2025.png`, serveras bara vid samtycke) är mappade till Ulf Carlsson och Johan Åhlander i den ordning bilderna kom. Byt i Admin → Heroes om det är fel.
- 2024 års data (33 tippare, placering per omgång) är importerad från `Allsvenskantips 2025.xlsx` (flikarna omg1–30). Äldre år kan klistras in i Admin → Heroes.
- **Spelarfoton** (`public/players`, 418 st) är nedladdade från klubbarnas sidor, API-Football och andra källor och skalade till 256 px. Bilderna kan vara upphovsrättsskyddade – håll repot privat och använd dem bara i tipset. Uppdatera arkivet: exportera `[{team, name, url}]` från databasen och kör `node scripts/download-player-photos.mjs lista.json`.
- Demotippare, tabellhistorik före omgång 22, chatt och odds är exempeldata. Tabellen efter omgång 22 samt skytte- och assistligan är riktiga (ESPN).
