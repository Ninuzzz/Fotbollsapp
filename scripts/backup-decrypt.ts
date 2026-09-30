/**
 * Återställer en backup till en vanlig databasfil och kontrollerar den.
 *
 *   BACKUP_PASSPHRASE=… npx tsx scripts/backup-decrypt.ts <backup.db.gz.enc | backup.db.gz> <ut.db>
 *
 * Skriptet skriver bara den nya filen och rör aldrig någon befintlig databas.
 * Se docs/DRIFT.md för hur en återställd fil läggs på plats.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { decryptBackup } from "../src/lib/backup-crypto";
import { verifyDatabaseFile } from "../src/lib/backup-verify";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("Användning: BACKUP_PASSPHRASE=… npx tsx scripts/backup-decrypt.ts <in.db.gz.enc|in.db.gz> <ut.db>");
  process.exit(2);
}
if (existsSync(output)) {
  console.error(`${output} finns redan – välj ett nytt filnamn så att inget skrivs över.`);
  process.exit(2);
}

async function main() {
  let data: Buffer = readFileSync(input!);
  if (input!.endsWith(".enc")) {
    const pass = process.env.BACKUP_PASSPHRASE ?? "";
    if (!pass) throw new Error("Sätt BACKUP_PASSPHRASE.");
    data = decryptBackup(data, pass);
  }
  // Packad fil känns igen på innehållet (gzip börjar med 1f 8b), inte på filnamnet – så att en omdöpt fil också fungerar
  if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
  writeFileSync(output!, data);
  const v = await verifyDatabaseFile(path.resolve(output!));
  console.log(`OK: ${output} är en hel databas – ${v.users} konton, ${v.entries} deltaganden, ${v.snapshots} tabeller.`);
}

main().catch((e) => {
  console.error("Misslyckades:", (e as Error).message);
  process.exit(1);
});
