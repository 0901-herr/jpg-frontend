import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadPersistedSelection,
  persistSelection,
} from './browsePersistence'

describe('browsePersistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persists selection in localStorage', () => {
    persistSelection(new Set(['5012', '5026']))
    expect(loadPersistedSelection()).toEqual(new Set(['5012', '5026']))
  })

  it('returns null when the key has never been written', () => {
    expect(loadPersistedSelection()).toBeNull()
  })

  it('returns an empty Set for an explicitly persisted empty selection', () => {
    persistSelection(new Set())
    expect(loadPersistedSelection()).toEqual(new Set())
    expect(loadPersistedSelection()).not.toBeNull()
  })

  it('returns a Set of the persisted ids', () => {
    persistSelection(new Set(['5012', '5026']))
    expect(loadPersistedSelection()).toEqual(new Set(['5012', '5026']))
  })
})
