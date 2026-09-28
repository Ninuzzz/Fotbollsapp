/** Körs en gång när Next.js-servern startar. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.INTERNAL_SCHEDULER === "false") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
