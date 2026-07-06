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

/** Description: show/hide the prose explanation of a change. */
export function IconFileText({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </Svg>
  )
}

/** Open the change in an external editor. */
export function IconExternalLink({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Svg>
  )
}

/** Maximize: enter focus mode on a single hunk. */
export function IconMaximize({ size }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Svg>
  )
}
