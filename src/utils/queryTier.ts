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

export const QUERY_TIER_ACCURATE_TOOLTIP =
  'Accurate mode searches more deeply and may take longer to answer.'

export const QUERY_TIER_FAST_TOOLTIP = 'Fast mode answers quickest but may miss details.'

export function getQueryTierTooltip(tier: QueryTier): string | undefined {
  switch (tier) {
    case 'accurate':
      return QUERY_TIER_ACCURATE_TOOLTIP
    case 'fast':
      return QUERY_TIER_FAST_TOOLTIP
    default:
      return undefined
  }
}
