/**
 * Visas direkt när man klickar på en länk (Next.js förhämtar den), medan sidan hämtas från servern.
 * Den tonar in först efter 150 ms, så att snabba sidbyten inte blinkar till.
 */
export default function Loading() {
  return (
    <div className="loading-fade mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Laddar …</span>
      <div className="h-4 w-40 animate-pulse rounded bg-surface-3" />
      <div className="mt-4 h-14 w-72 max-w-full animate-pulse rounded-xl bg-surface-2" />
      <div className="mt-4 h-4 w-full max-w-xl animate-pulse rounded bg-surface-2" />
      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-36 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
