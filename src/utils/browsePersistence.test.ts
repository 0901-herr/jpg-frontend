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
})
