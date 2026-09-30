/**
 * Tar en kontrollerad backup av databasen NU (t.ex. före en deploy):
 *   fly ssh console --app <appnamn> -C "npx tsx scripts/backup.ts före-deploy"
 * Lokalt: npm run backup
 */
import { createBackup } from "../src/lib/backup";

createBackup(process.argv[2] ?? "manuell")
  .then((i) => {
    console.log(`Backup klar: ${i.file} (${(i.bytes / 1024).toFixed(0)} kB)`);
    process.exit(0);
  })
  .catch((e) => {
    console.error("Backupen misslyckades:", (e as Error).message);
    process.exit(1);
  });
