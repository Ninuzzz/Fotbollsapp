# Drift – rutiner och skydd

Det här är dokumentet att öppna när något känns fel, och checklistan att gå igenom före en ny säsong. Det mesta är automatiskt, men några saker måste göras en gång för hand (avsnitt 2).

## 1. Vad som sker av sig självt

| Vad | Hur ofta | Om det går fel |
| --- | --- | --- |
| Tabell, skytte- och assistliga hämtas (ESPN, reserv API-Football om nyckel finns) | Var 10:e minut fredag–söndag kl 12–24 (svensk tid), annars varje timme, var 3:e timme före seriestart | Admin får en notis när inget lyckats på 6 timmar (fre–sön) eller 26 timmar (övriga dagar), och en när det fungerar igen |
| Tabellen kontrolleras före den sparas (placeringar 1–16, V+O+F = spelade, poäng = 3×V+O, målen går ihop, spelade matcher minskar aldrig) | Varje gång | En tabell som inte klarar kontrollerna publiceras **inte**. Den hamnar i karantän och admin får en notis att granska den (Admin → Översikt → Godkänn/Avvisa). Den gamla tabellen ligger kvar |
| Tabell och tipstabell sparas i en transaktion, under ett lås | Varje gång | Krasch mitt i lämnar ingen halv tabell. Samtidiga synkar (schemaläggare, admins knapp, extern cron) ger aldrig dubbletter |
| Backup (kontrollerad kopia, komprimerad) | Nattligen efter 03, 3 timmar före och efter deadline, vid varje omstart, före "Avsluta säsong" | Syns i Admin → Översikt → Go-live-kontroll |
| Påminnelser före deadline | 7, 3 och 1 dag före, mellan 09 och 20 svensk tid | – |
| Trupper, spelarfoton | Dagligen | Manuellt under Admin → Spelare |
| Nyheter | Varje timme | – |

Kontrollera själv när som helst: `https://<domän>/api/health` (svarar 200 om databasen lever) och `https://<domän>/api/health?strict=1` (svarar 503 även när tabellen är för gammal).

## 2. Görs en gång (annars är skydden inte på)

Admin → Översikt → **Go-live-kontroll** visar vad som återstår i rött och gult. Det som inte kan göras i appen:

1. **CRON_SECRET och BACKUP_PASSPHRASE** (minst 16 tecken vardera):
   ```bash
   fly secrets set CRON_SECRET=<lång slumpsträng> BACKUP_PASSPHRASE=<lång lösenfras> --app <appnamn>
   ```
   Spara lösenfrasen på två ställen utanför appen (t.ex. en lösenordshanterare och hos någon du litar på). **Utan den går backuperna inte att öppna.**
2. **Off-site-backup** (skyddar mot att disken försvinner, vilket backuper på samma disk inte gör). Lägg två hemligheter i GitHub → Settings → Secrets and variables → Actions: `APP_URL` (t.ex. `https://tipset-anders.fly.dev`) och `CRON_SECRET` (samma som ovan). Då hämtar `.github/workflows/backup.yml` en krypterad backup varje natt och sparar den i 30 dagar. Testa direkt: Actions → Backup → Run workflow.
3. **Övervakning utifrån**: skapa en gratis monitor (t.ex. UptimeRobot) mot `https://<domän>/api/health?strict=1` var 5:e minut med mejl eller sms till dig. Det larmar även om hela servern ligger nere, vilket appen inte kan larma om själv.
4. **Andra administratör**: Admin → Deltagare → utse en till. Då hänger inget på ett enda konto och lösenord.
5. **Ta bort startlösenordet**: `fly secrets unset SEED_ADMIN_PASSWORD --app <appnamn>`.
6. **Reservkälla för tabellen** (valfritt): en API-Football-nyckel ger en andra automatisk källa när ESPN är nere. Testa med knappen "Testa API-Football-nyckel". Utan den är manuell inmatning reserven.

## 3. Återställningsövning (gör den innan säsongen, och ta tid)

Målet är att veta att en backup går att öppna, innan man behöver den.

```bash
# 1. Hämta en krypterad backup (samma som workflowet gör) …
curl -H "Authorization: Bearer $CRON_SECRET" https://<domän>/api/backup -o backup.db.gz.enc
#    … eller ladda ner artefakten från GitHub Actions → Backup.

# 2. Dekryptera och kontrollera den. Skriver bara den nya filen och rör ingen databas.
BACKUP_PASSPHRASE=<lösenfrasen> npx tsx scripts/backup-decrypt.ts backup.db.gz.enc aterstalld.db
#    Förväntat: "OK: aterstalld.db är en hel databas – N konton, N deltaganden, N tabeller."
```

Rätt lösenfras och en hel fil ger OK. Fel lösenfras eller en skadad fil avvisas med ett tydligt fel. Testat av utvecklaren mot en produktionsbyggd server.

### Återställning i skarpt läge

Kommandona nedan är vanliga `flyctl`-kommandon men har **inte körts mot Fly** av den som skrev dokumentet. Öva dem på en kopia av appen först.

```bash
# 1. Ta en färsk backup av nuvarande läge (man kan behöva gå tillbaka)
fly ssh console --app <appnamn> -C "npx tsx scripts/backup.ts fore-aterstallning"
# 2. Ladda upp den återställda filen till disken
fly ssh sftp shell --app <appnamn>      # put aterstalld.db /data/restore.db
# 3. Byt på plats och starta om (SQLites WAL-filer måste bort)
fly ssh console --app <appnamn> -C "sh -c 'mv /data/tipset.db /data/tipset.db.fore-aterstallning && mv /data/restore.db /data/tipset.db && rm -f /data/tipset.db-wal /data/tipset.db-shm'"
fly apps restart <appnamn>
```

Lokala backuper ligger i `/data/backups` på samma disk (`fly ssh sftp shell` → `get`).

## 4. Deploy-regler

- **Ingen deploy** de sista 48 timmarna före deadline, och inte fredag–söndag kl 12–24 under säsongen. En deploy tar ned den enda maskinen en stund och nollställer minnet (t.ex. spärrar mot inloggningsförsök).
- Ta en backup före: `fly ssh console --app <appnamn> -C "npx tsx scripts/backup.ts fore-deploy"`. Appen tar också en vid varje omstart.
- Kör `npm test` och `npm run verify:season` före varje deploy. Båda ska vara gröna.

## 5. Om tabellen inte uppdateras

1. Admin → Översikt visar senaste lyckade synk, och Go-live-kontrollen visar vad som är fel.
2. Tryck **Hämta tabell & ligor nu**. Står det "väntar på ditt godkännande" har tabellen inte klarat kontrollerna: läs orsakerna (t.ex. "målen går inte ihop" betyder ofta en halvuppdaterad tabell hos ESPN, vänta 10 minuter) och tryck Godkänn eller Avvisa. Poängavdrag ger en varning som du kan godkänna.
3. Är ESPN nere längre: **Admin → Tabell**. Den är förifylld med senaste tabellen. Fyll i spelade matcher, målen och poängen. Tabellen kontrolleras och du får förklaring vid fel ("Spara ändå" om siffrorna stämmer, t.ex. vid poängavdrag). Samma flöde som automatiken, så notiser och utmärkelser blir rätt. Skytte- och assistligan: Admin → Spelare.
4. Användarna ser "Resultaten hämtades senast …" och en varning om tabellen ligger efter.

Övningsuppgift: gör en manuell tabell en gång före säsongen, så att det inte är första gången när det behövs.

## 6. Säsongsslut

1. Serien är klar när **alla** lag har spelat alla omgångar. Först då får admin notisen "Sista omgången är spelad". (En omgång räknas som färdigspelad redan när alla utom två lag spelat den, men det räcker inte för att dela ut pengar.)
2. Kontrollera slutställningen **och** skytte- och assistligan mot allsvenskan.se.
3. Admin → Tävlingar → **Avsluta säsong**. Knappen nekar om något lag inte spelat klart. "Avsluta ändå…" åsidosätter det efter en bekräftelse. Avslutet tar en backup, fastställer slutresultatet, fryser tabell, spelare, betalningar och tävlingsinställningar och skickar prislistan.
4. Kronor som inte delas ut (avrundning nedåt vid delade placeringar, högst några kronor) står i prislistan som "Ej utdelat". Bestäm själva vem de tillfaller.
5. Hittar du ett fel efteråt: **Öppna igen**, rätta, **Avsluta säsong** igen. Ändras prislistan skickas en rättelse till alla. Är den oförändrad skickas inget nytt.
6. Arkivera resultatet till historiken och lägg in vinnaren under Heroes.

## 7. Kända begränsningar

- ESPN:s API är inofficiellt och saknar avtal. Kontrollerna, karantänen och den dagliga formatkontrollen (`.github/workflows/espn-contract.yml`) finns för att det ska märkas direkt om det ändras, men de ersätter inte en reservkälla.
- Ett tips räknas först när alla 16 lag är placerade **och** skytt och assistkung är valda. Ofullständiga tips syns inte i tipstabellen och kan inte kompletteras efter deadline, men insatsen räknas ändå in i pottet. Admin → Översikt listar dem före deadline.
- Spärrar mot inloggningsförsök ligger i minnet och nollställs vid omstart. Det räcker för en maskin. Kör du fler måste de flyttas till Redis.
- Spelare som raderar sitt konto (GDPR) efter avslutad säsong ändrar den levande tabellen, men inte det fastställda slutresultatet eller redan skickade notiser.
