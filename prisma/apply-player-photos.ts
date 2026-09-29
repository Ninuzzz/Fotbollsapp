/**
 * Kopplar de sparade spelarfotona i repot till spelare som saknar bild.
 *   npm run photos:apply
 */
import { PrismaClient } from "@prisma/client";
import { applyPlayerPhotos } from "../src/lib/player-photo-archive";

export { applyPlayerPhotos };

if (require.main === module) {
  const db = new PrismaClient();
  applyPlayerPhotos(db)
    .then((r) => console.log(`Spelarfoton: ${r.applied} kopplade (${r.total} i arkivet)`))
    .finally(() => db.$disconnect());
}
