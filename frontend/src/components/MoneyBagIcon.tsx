export function MoneyBagIcon({ className, strokeWidth = 1.5 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Main bag body */}
      <path d="M4.5 16.5C4.5 20.09 7.91 23 12 23s7.5-2.91 7.5-6.5S16.09 10 12 10 4.5 12.91 4.5 16.5z"/>
      {/* Left side of neck, gathering upward */}
      <path d="M10 10C9.5 8.5 9.5 7 12 6.5"/>
      {/* Right side of neck, gathering upward */}
      <path d="M14 10C14.5 8.5 14.5 7 12 6.5"/>
      {/* Ribbon / tie across the neck */}
      <path d="M9.5 8.5q2.5.8 5 0"/>
      {/* Top knot */}
      <path d="M11 6.5C11 5 13 5 13 6.5"/>
    </svg>
  )
}
