import { afterEach, describe, expect, it, vi } from 'vitest'

// FEATURES reads import.meta.env at module load time, so each case needs a
// fresh module instance (vi.resetModules) after stubbing the env var —
// mutating process.env after this module has already been imported once
// would not change the frozen FEATURES object.
describe('FEATURES', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults categoryView to false when VITE_FEATURE_CATEGORY_VIEW is unset', async () => {
    vi.resetModules()
    const { FEATURES } = await import('./features')
    expect(FEATURES.categoryView).toBe(false)
  })

  it('defaults categoryView to false for any value other than the literal string "true"', async () => {
    vi.stubEnv('VITE_FEATURE_CATEGORY_VIEW', '1')
    vi.resetModules()
    const { FEATURES } = await import('./features')
    expect(FEATURES.categoryView).toBe(false)
  })

  it('turns categoryView on when VITE_FEATURE_CATEGORY_VIEW is exactly "true"', async () => {
    vi.stubEnv('VITE_FEATURE_CATEGORY_VIEW', 'true')
    vi.resetModules()
    const { FEATURES } = await import('./features')
    expect(FEATURES.categoryView).toBe(true)
  })
})
