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

// Darkened to Tailwind gray-900/-700 (client feedback, round 2: text
// still read as thin/light after the font-family fix alone). primary/body
// no lighter than gray-900; secondary/subtle no lighter than gray-700.
// muted/caption (tertiary — counts, timestamps, icons) are unchanged;
// they were not reported as hard to read. Keep in sync with
// --docu-text-primary / --docu-text-secondary in src/index.css and
// colorText/colorTextSecondary in src/App.tsx.
export const typeColor = {
  primary: 'text-[#111827]',
  body: 'text-[#111827]',
  secondary: 'text-[#374151]',
  muted: 'text-[#8e8e8e]',
  subtle: 'text-[#374151]',
  caption: 'text-[#8e8e8e]',
} as const

export const leading = {
  body: 'leading-normal',
  relaxed: 'leading-relaxed',
} as const
