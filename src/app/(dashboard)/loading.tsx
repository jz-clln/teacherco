function SkeletonBlock({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-[#E3E5E1] ${className}`} />;
}

export default function Loading() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      <span className="sr-only">Loading page</span>
      <div className="space-y-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-9 w-72 max-w-full" />
        <SkeletonBlock className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-3 rounded-xl border border-[#E3E5E1] bg-white p-5">
            <SkeletonBlock className="h-4 w-28" />
            <SkeletonBlock className="h-8 w-20" />
            <SkeletonBlock className="h-4 w-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-[#E3E5E1] bg-white p-5">
        <SkeletonBlock className="h-5 w-40" />
        <SkeletonBlock className="h-4 w-full" />
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="h-4 w-3/5" />
      </div>
    </div>
  );
}
