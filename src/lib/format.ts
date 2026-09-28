const TZ = "Europe/Stockholm";

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("sv-SE", { day: "numeric", month: "long", timeZone: TZ });

export const fmtDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });

export const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

export const kr = (n: number) => `${n.toLocaleString("sv-SE")} kr`;

export function relative(d: Date | string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "nyss";
  if (diff < 3600) return `${Math.floor(diff / 60)} min sedan`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} tim sedan`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} d sedan`;
  return fmtDate(d);
}

/** Datum för <input type="datetime-local"> i svensk tid */
export function toLocalInput(d: Date) {
  const s = new Date(d).toLocaleString("sv-SE", { timeZone: TZ, hour12: false });
  return s.replace(" ", "T").slice(0, 16);
}

/** Tolkar värdet från datetime-local som svensk tid */
export function fromLocalInput(v: string) {
  // Räkna ut Stockholms offset för det datumet
  const guess = new Date(v + ":00Z");
  const local = new Date(guess.toLocaleString("en-US", { timeZone: TZ }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()));
}
