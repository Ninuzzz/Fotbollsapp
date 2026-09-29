import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { HeroesEditor } from "./heroes-editor";

export default async function HeroesAdmin() {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const [heroes, years] = await Promise.all([
    db.hallOfFame.findMany({ orderBy: { year: "desc" } }),
    db.historicalResult.groupBy({ by: ["year"], _count: true, orderBy: { year: "desc" } }),
  ]);
  return (
    <HeroesEditor
      heroes={heroes.map((h) => ({ id: h.id, year: h.year, name: h.name, description: h.description, imageUrl: h.imageUrl ?? "", errors: h.errors, consent: h.consent }))}
      history={years.map((y) => ({ year: y.year, count: y._count }))}
    />
  );
}
