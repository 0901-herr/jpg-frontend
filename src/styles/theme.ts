/**
 * Shared UI tokens — mainstream AI-chat-inspired light palette.
 */
export const radius = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  full: 'rounded-full',
} as const

export const surface = {
  page: 'bg-[var(--docu-bg-app)]',
  main: 'bg-[var(--docu-bg-app)]',
  sidebar: 'bg-[var(--docu-bg-app)]',
  card: 'bg-[var(--docu-bg-app)] border border-[#ececec]',
  inset: 'bg-[#ececec]',
  hover: 'hover:bg-[#ececec]',
  // A step darker than `hover` (--docu-bg-active vs. --docu-bg-hover in
  // src/index.css) — an active/selected row must read as a step darker
  // than one the pointer is merely resting over, or the two states are
  // visually indistinguishable (client feedback: UI polish pass).
  active: 'bg-[var(--docu-bg-active)]',
} as const

export const border = {
  default: 'border-[#ececec]',
  subtle: 'border-[#f0f0f0]',
} as const

/** Section headers ("Files", "Chats", "Category") — small, uppercase,
 * letter-spaced and muted (client feedback: UI polish pass), matching the
 * quiet section labels of a mainstream AI-chat sidebar rather than
 * standing out as their own heading. */
export const sectionLabel =
  'inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#8e8e8e] mb-1.5'

/** @deprecated use sectionLabel — kept for imports */
export const sectionLabelPrimary = sectionLabel

/** Mainstream AI-chat-style sidebar nav rows */
export const sidebarNav = {
  row: 'rounded-[10px] transition-colors duration-150',
  idle: 'hover:bg-[#ececec]',
  active: 'bg-[var(--docu-bg-active)]',
  icon: 'w-5 h-5 text-[#6b6b6b]',
} as const

export const spacing = {
  page: 'p-3',
  panel: 'p-3',
  panelLg: 'px-2.5 py-2.5',
  gap: 'gap-2',
  section: 'gap-4',
  sectionY: 'py-3',
} as const

/** Interactive list row */
export const listRow = 'rounded-[10px] transition-colors duration-150'
