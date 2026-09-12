// Known category keys as of the current deployment's seeded taxonomy — kept
// in sync manually via `manage_categories.py`, not fetched at runtime. An
// unrecognized key (a category added later, or 'unknown') still renders,
// just without a curated label/color.
export const CATEGORY_LABELS: Record<string, string> = {
  daily_field_report: 'Daily Field Report',
  harvesting_record: 'Harvesting Record',
  planting_replanting_record: 'Planting & Replanting Record',
  yield_analysis_report: 'Yield Analysis Report',
}

export const CATEGORY_COLORS: Record<string, string> = {
  daily_field_report: 'blue',
  harvesting_record: 'green',
  planting_replanting_record: 'gold',
  yield_analysis_report: 'purple',
}

const FALLBACK_COLORS = ['cyan', 'geekblue', 'magenta', 'volcano', 'lime'] as const

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatCategoryLabel(category: string | null | undefined): string {
  if (!category || category === 'unknown') return 'Uncategorized'
  return CATEGORY_LABELS[category] ?? titleCase(category)
}

export function getCategoryColor(category: string | null | undefined): string {
  if (!category || category === 'unknown') return 'default'
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category]
  let hash = 0
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length]
}
