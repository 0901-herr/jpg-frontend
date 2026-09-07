/**
 * Shared UI tokens — ChatGPT-inspired light palette.
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
  active: 'bg-[#ececec]',
} as const

export const border = {
  default: 'border-[#ececec]',
  subtle: 'border-[#f0f0f0]',
} as const

/** Section headers — black, slightly larger */
export const sectionLabel =
  'inline-flex items-center gap-2 text-sm font-medium text-[#0d0d0d] mb-1.5'

/** @deprecated use sectionLabel — kept for imports */
export const sectionLabelPrimary = sectionLabel

/** ChatGPT-style sidebar nav rows */
export const sidebarNav = {
  row: 'rounded-[10px] transition-colors duration-150',
  idle: 'hover:bg-[#ececec]',
  active: 'bg-[#ececec]',
  icon: 'w-5 h-5 text-[#676767]',
} as const

export const spacing = {
  page: 'p-3',
  panel: 'p-3',
  panelLg: 'px-3 py-3',
  gap: 'gap-2',
  section: 'gap-5',
  sectionY: 'py-4',
} as const

/** Interactive list row */
export const listRow = 'rounded-[10px] transition-colors duration-150'
