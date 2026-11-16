/** Statistics mark (yearly bars with a rising trend line) in the accent tile; used in the header and the footer. */
export function BrandLogo({ size = 36 }: { size?: number }) {
  const icon = Math.round(size * 0.61)
  return (
    <span className="brand-logo" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={icon} height={icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <rect x="5" y="15" width="3" height="4" rx="0.6" fill="currentColor" fillOpacity="0.35" />
        <rect x="10.5" y="12" width="3" height="7" rx="0.6" fill="currentColor" fillOpacity="0.35" />
        <rect x="16" y="9" width="3" height="10" rx="0.6" fill="currentColor" fillOpacity="0.35" />
        <path d="M4 11.5l5.5-3.5 4 2L20 4" />
        <path d="M16 4h4v4" />
      </svg>
    </span>
  )
}
