const TZ = "Europe/Stockholm";
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "2-digit", hourCycle: "h23" });
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Veckodag (0 = söndag … 6 = lördag) och timme (0–23) i svensk tid, oavsett serverns tidszon. */
export function stockholmParts(d = new Date()) {
  const parts = fmt.formatToParts(d);
  const weekday = DAYS.indexOf(parts.find((p) => p.type === "weekday")!.value);
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  return { weekday, hour };
}

/** Fredag–söndag: då spelas Allsvenskans omgångar (mitt i veckan spelas några, men tabellen ändras då sällan). */
export function isMatchWeekday(d = new Date()) {
  const { weekday } = stockholmParts(d);
  return weekday === 5 || weekday === 6 || weekday === 0;
}
