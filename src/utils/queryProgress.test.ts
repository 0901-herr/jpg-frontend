import { describe, expect, it } from 'vitest'
import { formatProgressStage, formatRouteLabel } from './queryProgress'

describe('formatProgressStage', () => {
  it('maps known stages', () => {
    expect(formatProgressStage('retrieving')).toBe('Retrieving documents…')
  })

  it('falls back for unknown stages', () => {
    expect(formatProgressStage('custom_stage')).toBe('Working (custom_stage)…')
  })
})

describe('formatRouteLabel', () => {
  it('maps simple lookup', () => {
    expect(formatRouteLabel('simple_lookup')).toBe('Simple lookup')
  })
})
