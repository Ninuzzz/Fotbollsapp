/**
 * Kontroll av en databasfil (t.ex. en backup): SQLites egen integritetskontroll plus att tabellerna går att läsa.
 * Fristående från appens `db` så att den fungerar i återställningsskript utan DATABASE_URL.
 */
import { PrismaClient } from "@prisma/client";

export type VerifyResult = { users: number; entries: number; snapshots: number };

export async function verifyDatabaseFile(file: string): Promise<VerifyResult> {
  const client = new PrismaClient({ datasources: { db: { url: `file:${file}` } } });
  try {
    const check = await client.$queryRawUnsafe<{ integrity_check: string }[]>("PRAGMA integrity_check");
    if (check.length !== 1 || check[0]!.integrity_check !== "ok") throw new Error(`Integritetskontrollen misslyckades: ${JSON.stringify(check).slice(0, 200)}`);
    const count = async (table: string) => Number((await client.$queryRawUnsafe<{ n: bigint | number }[]>(`SELECT count(*) AS n FROM "${table}"`))[0]!.n);
    return { users: await count("User"), entries: await count("Entry"), snapshots: await count("StandingSnapshot") };
  } finally {
    await client.$disconnect();
  }
}
