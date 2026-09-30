import { NextResponse, type NextRequest } from "next/server";
import { getActiveSeason } from "@/lib/season";
import { syncFromApi } from "@/lib/football-api";
import { remindMissing } from "@/lib/reminders";
import { refreshNews } from "@/lib/news";
import { runScheduledJobs } from "@/lib/scheduler";
import { cronAuthorized } from "@/lib/security";
import { createBackup } from "@/lib/backup";

/**
 * Schemalagda jobb. Anropa t.ex. varje timme under matchdagar:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<din-domän>/api/cron?job=sync
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<din-domän>/api/cron?job=reminders   (dagligen)
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<din-domän>/api/cron?job=all         (allt, var 10:e–30:e minut)
 * Den inbyggda schemaläggaren gör detta av sig själv (se scheduler.ts); en extern cron är ett andra, oberoende hjärtslag.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req.headers.get("authorization"))) return NextResponse.json({ error: "Nekad" }, { status: 401 });
  const season = await getActiveSeason();
  if (!season) return NextResponse.json({ error: "Ingen aktiv säsong" }, { status: 404 });
  const job = req.nextUrl.searchParams.get("job");
  try {
    if (job === "sync") {
      return NextResponse.json(await syncFromApi(season.id));
    }
    if (job === "reminders") return NextResponse.json({ result: await remindMissing(season) });
    if (job === "news") return NextResponse.json({ items: (await refreshNews()).length });
    if (job === "all") return NextResponse.json({ log: await runScheduledJobs("cron", { force: true }) });
    if (job === "backup") {
      const b = await createBackup("cron");
      return NextResponse.json({ file: b.file, bytes: b.bytes });
    }
    return NextResponse.json({ error: "Okänt jobb" }, { status: 400 });
  } catch (e) {
    console.error("cron", job, e);
    return NextResponse.json({ error: "Jobbet misslyckades" }, { status: 500 });
  }
}
