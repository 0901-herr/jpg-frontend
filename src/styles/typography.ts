/**
 * Typography — mainstream AI-chat scale (14px sidebar, 16px main).
 */
export const type = {
  caption: 'text-sm',
  body: 'text-base',
  bodyLg: 'text-lg',
  title: 'text-xl',
} as const

/** Sidebar — matches a mainstream AI-chat nav (~14px) */
export const sidebar = {
  caption: 'text-xs',
  body: 'text-sm',
  title: 'text-[15px]',
} as const

// Neutral ink, not pure black — mainstream AI-chat layouts use a soft
// near-black for primary text and a mid-grey for secondary (client
// feedback: UI polish pass). Keep in sync with --docu-text-primary /
// --docu-text-secondary in src/index.css.
export const typeColor = {
  primary: 'text-[#1f1f1f]',
  body: 'text-[#1f1f1f]',
  secondary: 'text-[#6b6b6b]',
  muted: 'text-[#8e8e8e]',
  subtle: 'text-[#6b6b6b]',
  caption: 'text-[#8e8e8e]',
} as const

export const leading = {
  body: 'leading-normal',
  relaxed: 'leading-relaxed',
} as const
