/**
 * Är tabellsynken för gammal? Ren funktion (ingen databas) så att den går att testa exakt.
 */
import { isMatchWeekday } from "./time";

const HOUR = 3_600_000;

export type Staleness = { watching: boolean; stale: boolean; ageMin: number; thresholdMin: number };

/**
 * Bevakningen börjar 12 timmar före seriestart. Tröskel: 6 timmar fredag–söndag (då matcherna spelas), 26 timmar
 * övriga dagar. Tabellens egen ålder duger inte som mått – den står still i dagar under uppehåll – därför mäts tiden
 * sedan senaste LYCKADE synk.
 */
export function syncStaleness(season: { startDate: Date; isFinished: boolean }, lastOkAt: Date | null, now = new Date()): Staleness {
  const watchFrom = season.startDate.getTime() - 12 * HOUR;
  const thresholdMin = (isMatchWeekday(now) ? 6 : 26) * 60;
  if (season.isFinished || now.getTime() < watchFrom) return { watching: false, stale: false, ageMin: 0, thresholdMin };
  const baseline = Math.max(lastOkAt?.getTime() ?? 0, watchFrom);
  const ageMin = Math.round((now.getTime() - baseline) / 60_000);
  return { watching: true, stale: ageMin > thresholdMin, ageMin, thresholdMin };
}
