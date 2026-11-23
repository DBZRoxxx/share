export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9b8cff" />
          <stop offset="1" stopColor="#5b47f5" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
      <rect x="13" y="17" width="38" height="25" rx="4" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M24 49h16" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
      <path d="M28 25l9 4.5-9 4.5z" fill="#fff" />
    </svg>
  )
}
