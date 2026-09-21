/** Enable mock chat data for the citation and full-layout composer previews. */
export function isCitationDemoEnabled(): boolean {
  if (import.meta.env.VITE_DEMO_CITATIONS === 'true') return true
  if (typeof window === 'undefined') return false
  const demo = new URLSearchParams(window.location.search).get('demo')
  return (
    demo === 'citations' ||
    demo === 'citations-loading' ||
    demo === 'composer' ||
    isComposerDemoEnabled()
  )
}

/** Loading-only demo: ?demo=citations-loading */
export function isCitationLoadingDemoEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('demo') === 'citations-loading'
}

/** Full chat layout with mocked, enabled composer controls. */
export function isComposerDemoEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const demo = new URLSearchParams(window.location.search).get('demo')
  return demo === 'composer' || window.location.pathname === '/chat/demo/composer'
}
