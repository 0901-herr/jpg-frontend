/** Shared responsive breakpoint for collapsing a fixed-width sidebar nav
 * into a hamburger + antd Drawer — the chat sidebar (`AppLayout.tsx`) and
 * the admin console's two nav levels (`AdminLayout.tsx`,
 * `IngestionSectionNav.tsx` via `IngestionOverviewPage.tsx`) all switch at
 * the same width so the app has one consistent "narrow layout" threshold
 * rather than several ad hoc ones.
 *
 * 767.98px, not 768: a device reporting exactly 768px CSS pixels should
 * land on the desktop side of the breakpoint, matching a `max-width: 767px`
 * media query's usual `.98px` convention for avoiding a 1px gap against a
 * paired `min-width: 768px` rule. */
export const NARROW_LAYOUT_QUERY = '(max-width: 767.98px)'
