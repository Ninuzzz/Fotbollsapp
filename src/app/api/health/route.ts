import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getActiveSeason, seasonPhase } from "@/lib/season";
import { getSyncStatus, syncStaleness } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * Hälsokontroll för Fly och för extern övervakning (t.ex. UptimeRobot).
 *  - 200 så länge databasen svarar. 503 om den inte gör det.
 *  - ?strict=1 ger även 503 när tabellen är för gammal (se syncStaleness), så att en extern övervakare kan larma.
 * Innehåller inget personligt eller hemligt.
 */
export async function GET(req: NextRequest) {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    return NextResponse.json({ ok: false, db: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const season = await getActiveSeason();
  const status = await getSyncStatus();
  const s = season ? syncStaleness(season, status.lastOkAt) : null;
  const strict = req.nextUrl.searchParams.get("strict") === "1";
  return NextResponse.json(
    {
      ok: !(strict && s?.stale),
      db: true,
      season: season ? { year: season.year, phase: seasonPhase(season) } : null,
      sync: {
        lastOkAt: status.lastOkAt?.toISOString() ?? null,
        lastAttemptOk: status.lastAttempt?.ok ?? null,
        watching: s?.watching ?? false,
        stale: s?.stale ?? false,
        ageMinutes: s?.ageMin ?? null,
      },
    },
    { status: strict && s?.stale ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
