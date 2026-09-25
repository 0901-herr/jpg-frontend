/**
 * Shared sans-serif stack for app shell and Ant Design.
 *
 * ChatGPT-portal system-UI stack (client feedback round 4) — see
 * docu-font-family in src/index.css, kept in sync with this constant. `system-ui` picks up the platform's native UI font
 * (Segoe UI on Windows, San Francisco on macOS, Roboto on Android/Chrome
 * OS) without naming any vendor font directly, so nothing here favours
 * one platform's font over another's. No webfont is loaded.
 */
export const FONT_FAMILY_SANS =
  "ui-sans-serif, -apple-system, system-ui, 'Segoe UI', Helvetica, 'Apple Color Emoji', Arial, sans-serif, 'Segoe UI Emoji', 'Segoe UI Symbol'"

/** Monospace stack for host:port and technical values. */
export const FONT_FAMILY_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
