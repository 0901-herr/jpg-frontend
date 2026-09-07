/**
 * Typography — ChatGPT-style scale (14px sidebar, 16px main).
 */
export const type = {
  caption: 'text-sm',
  body: 'text-base',
  bodyLg: 'text-lg',
  title: 'text-xl',
} as const

/** Sidebar — matches ChatGPT nav (~14px) */
export const sidebar = {
  caption: 'text-xs',
  body: 'text-sm',
  title: 'text-[15px]',
} as const

export const typeColor = {
  primary: 'text-[#0d0d0d]',
  body: 'text-[#0d0d0d]',
  secondary: 'text-[#676767]',
  muted: 'text-[#8e8e8e]',
  subtle: 'text-[#676767]',
  caption: 'text-[#8e8e8e]',
} as const

export const leading = {
  body: 'leading-normal',
  relaxed: 'leading-relaxed',
} as const
