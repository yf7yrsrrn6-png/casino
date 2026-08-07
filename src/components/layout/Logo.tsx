export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-[11px] bg-white text-[#0a0b0d] shadow-[0_6px_18px_-6px_rgba(255,255,255,0.25)]">
        <span className="absolute inset-x-0 top-0 h-1/2 bg-black/5" />
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative"
        >
          <path d="M3 17l5-5 3 3 7-8" />
          <path d="M15 7h4v4" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-text">Trading Journal</div>
          <div className="text-[11px] font-medium text-subtle">terminal workspace</div>
        </div>
      )}
    </div>
  )
}
