/**
 * Backup av SQLite-databasen. Använder SQLites `VACUUM INTO`, som ger en konsekvent kopia även medan appen skriver
 * (att kopiera själva filen medan den används kan ge en trasig backup). Kopian integritetskontrolleras innan den
 * komprimeras och sparas, så en backup som inte går att läsa räknas aldrig som en backup.
 *
 * Lokala kopior ligger på samma disk som databasen och skyddar mot fel i appen, inte mot att disken försvinner.
 * För det finns den krypterade nedladdningen (src/app/api/backup/route.ts + .github/workflows/backup.yml).
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { db } from "./db";
import { verifyDatabaseFile } from "./backup-verify";

export type BackupInfo = { file: string; bytes: number; at: string; reason: string };

/** Sökvägen till SQLite-filen (relativa sökvägar gäller från prisma-mappen, som i Prisma). */
export function databaseFile(): string | null {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const p = decodeURIComponent(url.slice(5).split("?")[0]!);
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), "prisma", p);
}

export function backupDir(): string {
  if (process.env.BACKUP_DIR) return path.resolve(process.env.BACKUP_DIR);
  return path.join(path.dirname(databaseFile() ?? path.resolve(process.cwd(), "prisma", "x.db")), "backups");
}

const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "manuell";
const NAME = /^tipset-(\d{8}-\d{6}-\d{3})-(.+)\.db\.gz$/;
/** Hur många kopior som sparas per typ (nattliga oftast, övriga är tillfälliga fasta punkter). */
const KEEP: Record<string, number> = { natt: 7 };
const KEEP_DEFAULT = 5;

export async function createBackup(reason: string): Promise<BackupInfo> {
  const dir = backupDir();
  await mkdir(dir, { recursive: true });
  // Med millisekunder, så att två backuper samma sekund aldrig skriver över varandra
  const stamp = new Date().toISOString().replace(/Z$/, "").replace(/[-:]/g, "").replace("T", "-").replace(".", "-");
  const raw = path.join(dir, `tipset-${stamp}-${safe(reason)}.db`);
  const gz = `${raw}.gz`;
  await rm(raw, { force: true });
  await db.$executeRawUnsafe(`VACUUM INTO '${raw.replace(/'/g, "''")}'`);
  try {
    await verifyDatabaseFile(raw);
    await pipeline(createReadStream(raw), createGzip({ level: 6 }), createWriteStream(gz));
  } catch (e) {
    await rm(gz, { force: true });
    throw e;
  } finally {
    await rm(raw, { force: true });
  }
  const info: BackupInfo = { file: gz, bytes: (await stat(gz)).size, at: new Date().toISOString(), reason: safe(reason) };
  const value = JSON.stringify({ at: info.at, file: path.basename(gz), bytes: info.bytes, reason: info.reason });
  await db.setting.upsert({ where: { key: "lastBackup" }, create: { key: "lastBackup", value }, update: { value } });
  await rotateBackups(dir).catch(() => {});
  return info;
}

export async function listBackups(): Promise<BackupInfo[]> {
  const dir = backupDir();
  const names = await readdir(dir).catch(() => [] as string[]);
  const out: BackupInfo[] = [];
  for (const n of names) {
    const m = NAME.exec(n);
    if (!m) continue;
    const s = await stat(path.join(dir, n));
    out.push({ file: path.join(dir, n), bytes: s.size, at: s.mtime.toISOString(), reason: m[2]! });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

async function rotateBackups(dir: string) {
  const names = (await readdir(dir)).filter((n) => NAME.test(n)).sort().reverse(); // nyast först (tidsstämpeln sorterar rätt)
  const seen = new Map<string, number>();
  for (const n of names) {
    const reason = NAME.exec(n)![2]!;
    const count = (seen.get(reason) ?? 0) + 1;
    seen.set(reason, count);
    if (count > (KEEP[reason] ?? KEEP_DEFAULT)) await rm(path.join(dir, n), { force: true });
  }
}
