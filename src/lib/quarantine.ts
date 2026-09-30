/**
 * Karantän för misstänkta tabeller. En hämtad tabell som inte klarar kontrollerna (se standings-validation.ts) publiceras
 * inte. Den läggs här, admin får en notis och kan granska och godkänna eller avvisa den under Admin → Översikt.
 * Senaste giltiga tabellen ligger kvar tills dess.
 */
import { db } from "./db";
import { sendNotification } from "./notify";
import type { StandingCheckRow } from "./standings-validation";

export type PendingRow = StandingCheckRow & { form: string };
export type PendingStandings = { at: string; provider: string | null; issues: string[]; rows: PendingRow[]; alerted: boolean };

const key = (seasonId: string) => `pendingStandings:${seasonId}`;

export async function getPendingStandings(seasonId: string): Promise<PendingStandings | null> {
  const raw = (await db.setting.findUnique({ where: { key: key(seasonId) } }))?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingStandings;
  } catch {
    return null;
  }
}

export async function clearPendingStandings(seasonId: string) {
  await db.setting.deleteMany({ where: { key: key(seasonId) } });
}

/** Lägger tabellen i karantän. Admin får bara en notis per unik tabell, inte en per timme. */
export async function holdStandings(seasonId: string, data: { provider: string | null; issues: string[]; rows: PendingRow[] }) {
  const prev = await getPendingStandings(seasonId);
  const same = prev && JSON.stringify(prev.rows) === JSON.stringify(data.rows);
  const record: PendingStandings = { at: new Date().toISOString(), provider: data.provider, issues: data.issues, rows: data.rows, alerted: Boolean(same && prev.alerted) };
  if (!record.alerted) {
    try {
      await sendNotification({
        type: "GENERAL",
        audience: "ADMIN",
        title: "Tabellen från API:et ser inte rätt ut – väntar på dig",
        body: `${data.issues.slice(0, 3).join("\n")}${data.issues.length > 3 ? `\n(+${data.issues.length - 3} till)` : ""}\nDen gamla tabellen ligger kvar. Granska och godkänn eller avvisa under Admin → Översikt.`,
        link: "/admin",
        seasonId,
      });
      record.alerted = true;
    } catch {
      // notisen får aldrig stoppa karantänen
    }
  }
  await db.setting.upsert({ where: { key: key(seasonId) }, create: { key: key(seasonId), value: JSON.stringify(record) }, update: { value: JSON.stringify(record) } });
  return record;
}
