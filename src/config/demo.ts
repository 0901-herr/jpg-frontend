/** Enable mock citation chat via ?demo=citations or VITE_DEMO_CITATIONS=true */
export function isCitationDemoEnabled(): boolean {
  if (import.meta.env.VITE_DEMO_CITATIONS === 'true') return true
  if (typeof window === 'undefined') return false
  const demo = new URLSearchParams(window.location.search).get('demo')
  return demo === 'citations' || demo === 'citations-loading'
}

/** Loading-only demo: ?demo=citations-loading */
export function isCitationLoadingDemoEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('demo') === 'citations-loading'
}
