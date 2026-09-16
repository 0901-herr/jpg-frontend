import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatCategoryLabel, getCategoryColor } from './classification'

describe('formatCategoryLabel', () => {
  it('returns "Uncategorized" for null, undefined, and "unknown"', () => {
    expect(formatCategoryLabel(null)).toBe('Uncategorized')
    expect(formatCategoryLabel(undefined)).toBe('Uncategorized')
    expect(formatCategoryLabel('unknown')).toBe('Uncategorized')
  })

  it('title-cases an unrecognized category with no configured override', () => {
    expect(formatCategoryLabel('board_meeting_minutes')).toBe('Board Meeting Minutes')
  })
})

describe('getCategoryColor', () => {
  it('returns "default" for null, undefined, and "unknown"', () => {
    expect(getCategoryColor(null)).toBe('default')
    expect(getCategoryColor(undefined)).toBe('default')
    expect(getCategoryColor('unknown')).toBe('default')
  })

  it('deterministically hashes an unrecognized category to one of the fallback colors', () => {
    const color = getCategoryColor('board_meeting_minutes')
    expect(['cyan', 'geekblue', 'magenta', 'volcano', 'lime']).toContain(color)
    expect(getCategoryColor('board_meeting_minutes')).toBe(color)
  })
})

// CATEGORY_LABELS/CATEGORY_COLORS read import.meta.env at module load time,
// so each case needs a fresh module instance (vi.resetModules) after
// stubbing the env var — mirrors the pattern in src/config/features.test.ts.
describe('per-deployment overrides (VITE_CATEGORY_LABELS / VITE_CATEGORY_COLORS)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('uses the configured label and color for a category present in the override JSON', async () => {
    vi.stubEnv('VITE_CATEGORY_LABELS', JSON.stringify({ harvesting_record: 'Harvesting Record' }))
    vi.stubEnv('VITE_CATEGORY_COLORS', JSON.stringify({ harvesting_record: 'green' }))
    vi.resetModules()
    const { formatCategoryLabel: label, getCategoryColor: color } = await import('./classification')
    expect(label('harvesting_record')).toBe('Harvesting Record')
    expect(color('harvesting_record')).toBe('green')
  })

  it('falls back to titleCase/hash for a category not present in a configured override', async () => {
    vi.stubEnv('VITE_CATEGORY_LABELS', JSON.stringify({ harvesting_record: 'Harvesting Record' }))
    vi.resetModules()
    const { formatCategoryLabel: label } = await import('./classification')
    expect(label('board_meeting_minutes')).toBe('Board Meeting Minutes')
  })

  it('falls back gracefully when the override env var is invalid JSON', async () => {
    vi.stubEnv('VITE_CATEGORY_LABELS', '{not valid json')
    vi.resetModules()
    const { formatCategoryLabel: label } = await import('./classification')
    expect(label('board_meeting_minutes')).toBe('Board Meeting Minutes')
  })
})
