/** Körs en gång när Next.js-servern startar. */
export async function register() {
  // Importen måste ligga INNE i ett positivt NEXT_RUNTIME-villkor: då kan bundlern ta bort den ur Edge-bygget.
  // (En tidig "return" räcker inte – då försöker webpack bunta web-push/http för Edge och bygget går sönder.)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build" || process.env.INTERNAL_SCHEDULER === "false") return;
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
