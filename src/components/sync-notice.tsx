import { getSyncStatus, syncStaleness } from "@/lib/health";
import { fmtDateTime } from "@/lib/format";
import type { Season } from "@/lib/season";

/**
 * "Resultaten hämtades senast …" – så att en frusen tabell aldrig ser ut som att ingenting hänt.
 * Tabellens egen ålder duger inte (den står still i dagar under uppehåll), därför visas tidpunkten för senaste lyckade synk.
 */
export async function SyncNotice({ season }: { season: Season }) {
  const status = await getSyncStatus();
  const s = syncStaleness(season, status.lastOkAt);
  if (!status.lastOkAt && !s.stale) return null;
  return (
    <p className="mt-2 text-sm">
      {status.lastOkAt && <span className="text-muted">Resultaten hämtades senast {fmtDateTime(status.lastOkAt)}.</span>}
      {s.stale && <span className="ml-1 font-semibold text-gold">Vi har svårt att hämta nya resultat just nu, så tabellen kan ligga efter. Anders är underrättad.</span>}
    </p>
  );
}
