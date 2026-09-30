import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { toLocalInput } from "@/lib/format";
import { getFinalResult } from "@/lib/finish";
import { SeasonForms } from "./season-forms";

export default async function SeasonsAdmin() {
  // Skyddet i layouten räcker inte: sidor kan renderas utan layouten (RSC-förfrågningar)
  await requireAdmin();
  const seasons = await db.season.findMany({ orderBy: { year: "desc" }, include: { _count: { select: { teams: true, entries: true } } } });
  const finals = new Map(await Promise.all(seasons.filter((s) => s.isFinished).map(async (s) => [s.id, (await getFinalResult(s.id))?.at ?? null] as const)));
  return (
    <SeasonForms
      seasons={seasons.map((s) => ({
        id: s.id,
        name: s.name,
        year: s.year,
        startDate: toLocalInput(s.startDate),
        registrationDeadline: toLocalInput(s.registrationDeadline),
        editDeadline: toLocalInput(s.editDeadline),
        entryFee: s.entryFee,
        swishNumber: s.swishNumber,
        reservedAmount: s.reservedAmount,
        prizeSplit: s.prizeSplit,
        totalRounds: s.totalRounds,
        isActive: s.isActive,
        isFinished: s.isFinished,
        teams: s._count.teams,
        entries: s._count.entries,
        finalAt: finals.get(s.id) ?? null,
      }))}
    />
  );
}
