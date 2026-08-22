/**
 * Typography scale — Tailwind classes aligned with Ant Design font tokens.
 *
 * caption  12px  (fontSizeSM)
 * body     14px  (fontSize)
 * bodyLg   16px  (fontSizeLG) — file tree
 * title    18px  (fontSizeHeading4)
 */
export const type = {
  caption: 'text-xs',
  body: 'text-sm',
  bodyLg: 'text-base',
  title: 'text-lg',
} as const

export const typeColor = {
  primary: 'text-gray-900',
  body: 'text-gray-800',
  secondary: 'text-gray-700',
  muted: 'text-gray-400',
  subtle: 'text-gray-500',
  caption: 'text-gray-600',
} as const
