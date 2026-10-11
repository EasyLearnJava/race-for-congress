// Placeholder for a state page while its params resolve (the route's App Shell). Server-safe.
export function StateSkeleton() {
  const block = "rounded-xl border border-line bg-surface motion-safe:animate-pulse";
  return (
    <div className="pb-8" aria-busy="true" aria-label="Loading state">
      <div className="pt-6 pb-5 sm:pt-8">
        <div className="h-3 w-32 rounded bg-surface-2" />
        <div className="mt-3 h-9 w-56 rounded bg-surface-2" />
        <div className="mt-3 h-4 w-full max-w-2xl rounded bg-surface-2" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`${block} h-[104px]`} />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className={`${block} h-[360px] lg:col-span-2`} />
        <div className={`${block} h-[360px]`} />
      </div>
    </div>
  );
}
