import { db } from "./db";
import { sendNotification } from "./notify";
import type { Season } from "./season";

/**
 * Deadline-påminnelser till de som inte lämnat in tips.
 * Automatiskt: 7, 3 och 1 dag före deadline (anropas dagligen av cron). Admin kan även tvinga fram en.
 */
export async function remindMissing(season: Season, force = false) {
  const days = Math.ceil((season.editDeadline.getTime() - Date.now()) / 864e5);
  if (days < 0) return "Deadline har passerat.";
  if (!force && ![7, 3, 1].includes(days)) return `Ingen påminnelse idag (${days} dagar kvar).`;
  const key = `reminder:${season.id}:${days}`;
  if (!force && (await db.setting.findUnique({ where: { key } }))) return "Påminnelse redan skickad idag.";
  const r = await sendNotification({
    type: "DEADLINE",
    audience: "MISSING_TIPS",
    title: days <= 1 ? "Sista chansen att tippa!" : `${days} dagar kvar att tippa`,
    body: `Du har inte lämnat in ditt tips för ${season.name} än. Deadline: ${season.editDeadline.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "long", timeStyle: "short" })}.`,
    link: "/tipsa",
    seasonId: season.id,
  });
  await db.setting.upsert({ where: { key }, create: { key, value: new Date().toISOString() }, update: { value: new Date().toISOString() } });
  return `Påminnelse skickad (${r.pushed} push).`;
}
