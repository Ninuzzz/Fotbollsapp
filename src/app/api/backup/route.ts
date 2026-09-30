import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cronAuthorized, rateLimit } from "@/lib/security";
import { createBackup } from "@/lib/backup";
import { encryptBackup } from "@/lib/backup-crypto";

export const dynamic = "force-dynamic";

/**
 * Krypterad backup för off-site-lagring. Skapar en färsk, kontrollerad kopia och returnerar den krypterad
 * (AES-256-GCM med BACKUP_PASSPHRASE). Skyddad med CRON_SECRET, precis som /api/cron.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<domän>/api/backup -o backup.db.gz.enc
 *   BACKUP_PASSPHRASE=… npx tsx scripts/backup-decrypt.ts backup.db.gz.enc återställd.db
 *
 * Anropas nattligen av .github/workflows/backup.yml.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Nekad" }, { status: 401 });
  const pass = process.env.BACKUP_PASSPHRASE ?? "";
  if (pass.length < 16)
    return NextResponse.json({ error: "BACKUP_PASSPHRASE saknas eller är kortare än 16 tecken. Backupen skulle annars skickas okrypterad." }, { status: 503 });
  if (!rateLimit("backup-download", 3, 10 * 60_000).ok) return NextResponse.json({ error: "För många anrop" }, { status: 429 });
  try {
    const info = await createBackup("extern");
    const data = encryptBackup(await readFile(info.file), pass);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${path.basename(info.file)}.enc"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("backup", e);
    return NextResponse.json({ error: "Backupen misslyckades" }, { status: 500 });
  }
}
