import { describe, expect, it } from 'vitest'
import {
  getQueryTierTooltip,
  QUERY_TIER_ACCURATE_TOOLTIP,
  QUERY_TIER_FAST_TOOLTIP,
  QUERY_TIER_NORMAL_TOOLTIP,
} from './queryTier'

describe('getQueryTierTooltip', () => {
  it('returns the accurate-mode tooltip for the accurate tier', () => {
    expect(getQueryTierTooltip('accurate')).toBe(QUERY_TIER_ACCURATE_TOOLTIP)
  })

  it('returns the fast-mode tooltip for the fast tier', () => {
    expect(getQueryTierTooltip('fast')).toBe(QUERY_TIER_FAST_TOOLTIP)
  })

  it('returns the normal-mode tooltip for the standard tier', () => {
    expect(getQueryTierTooltip('standard')).toBe(QUERY_TIER_NORMAL_TOOLTIP)
  })
})
