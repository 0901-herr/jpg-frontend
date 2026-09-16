// Optional per-deployment category label/color overrides, supplied at
// build time via VITE_CATEGORY_LABELS / VITE_CATEGORY_COLORS (each a
// JSON object string, e.g. '{"harvesting_record": "Harvesting Record"}').
// Categories with no override still render — via titleCase()/hash-based
// color below — so an unconfigured deployment (or an unrecognized key
// within a configured one) degrades gracefully rather than failing.
function parseJsonRecordEnv(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>
    }
    return {}
  } catch {
    return {}
  }
}

export const CATEGORY_LABELS: Record<string, string> = parseJsonRecordEnv(
  import.meta.env.VITE_CATEGORY_LABELS as string | undefined,
)

export const CATEGORY_COLORS: Record<string, string> = parseJsonRecordEnv(
  import.meta.env.VITE_CATEGORY_COLORS as string | undefined,
)

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
