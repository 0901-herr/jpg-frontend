import type { QueryTier } from '../api/types/query'

export const DEFAULT_QUERY_TIER: QueryTier = 'standard'

export const QUERY_TIER_OPTIONS: { value: QueryTier; label: string }[] = [
  { value: 'fast', label: 'Fast' },
  { value: 'standard', label: 'Normal' },
  { value: 'accurate', label: 'Accurate' },
]

export function getQueryTierLabel(tier: QueryTier): string {
  return QUERY_TIER_OPTIONS.find((option) => option.value === tier)?.label ?? 'Normal'
}

export const QUERY_TIER_FAST_TOOLTIP = 'Fastest answer. Uses a smaller model; may miss detail.'

export const QUERY_TIER_NORMAL_TOOLTIP =
  'Balanced speed and accuracy. Typically under a minute.'

export const QUERY_TIER_ACCURATE_TOOLTIP =
  'Most thorough answer. Can take a minute or more.'

/** Every tier warns about (or reassures on) waiting time — scope item 8. */
export function getQueryTierTooltip(tier: QueryTier): string {
  switch (tier) {
    case 'fast':
      return QUERY_TIER_FAST_TOOLTIP
    case 'accurate':
      return QUERY_TIER_ACCURATE_TOOLTIP
    default:
      return QUERY_TIER_NORMAL_TOOLTIP
  }
}
