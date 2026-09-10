import { describe, expect, it } from 'vitest'
import { formatProgressStage, formatRouteLabel, isLateQueryStage } from './queryProgress'

describe('formatProgressStage', () => {
  it('maps known stages', () => {
    expect(formatProgressStage('retrieving')).toBe('Searching your documents…')
  })

  it('maps assembly to almost done', () => {
    expect(formatProgressStage('assembly')).toBe(
      'Almost done — putting your answer together…',
    )
  })

  it('humanizes unknown stages without raw snake_case', () => {
    expect(formatProgressStage('custom_stage')).toBe('Still working — Custom Stage…')
  })
})

describe('formatRouteLabel', () => {
  it('maps simple lookup', () => {
    expect(formatRouteLabel('simple_lookup')).toBe('Quick lookup…')
  })
})

describe('isLateQueryStage', () => {
  it('detects assembly as late', () => {
    expect(isLateQueryStage('assembly')).toBe(true)
    expect(isLateQueryStage('retrieving')).toBe(false)
  })
})
