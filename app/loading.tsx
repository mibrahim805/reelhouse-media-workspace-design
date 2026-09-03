export default function Loading() {
  return (
    <main className="flex min-h-[calc(100svh-4.5rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl space-y-5 stagger-children" role="status" aria-label="Loading page">
        <div className="loading-shimmer h-8 w-48 rounded-xl" />
        <div className="loading-shimmer h-4 w-72 rounded-lg" />
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="loading-shimmer aspect-video rounded-2xl" />
          <div className="loading-shimmer aspect-video rounded-2xl" style={{ animationDelay: '0.1s' }} />
        </div>
      </div>
    </main>
  )
}
