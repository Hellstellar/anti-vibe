import type { ReactNode } from 'react'

/**
 * Inline SVG icons (Lucide paths, ISC-licensed) — no icon-font or emoji, so
 * they render identically everywhere, center exactly (fixed viewBox), and
 * follow the theme via currentColor. See RS-21.5.
 */
function Svg({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconChevronLeft({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  )
}

export function IconChevronRight({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  )
}

/** Focus: reveal / step deeper into a section — "look closely at this". */
export function IconEye({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

/** RSVP: continuous speed-read. */
export function IconFastForward({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <polygon points="13 19 22 12 13 5 13 19" />
      <polygon points="2 19 11 12 2 5 2 19" />
    </Svg>
  )
}

export function IconPause({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </Svg>
  )
}

export function IconPlay({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </Svg>
  )
}
