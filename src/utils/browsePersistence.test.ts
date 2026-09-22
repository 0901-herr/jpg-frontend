import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadPersistedExpandedFolders,
  loadPersistedSelection,
  persistExpandedFolders,
  persistSelection,
} from './browsePersistence'

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('round-trips persisted expanded-folder ids', () => {
    persistExpandedFolders(new Set([1, 2, 5054]))
    expect(loadPersistedExpandedFolders()).toEqual(new Set([1, 2, 5054]))
  })

  it('ignores unknown/garbage expanded-folder ids instead of throwing — a stale/deleted folder id is simply a number nothing else recognizes', () => {
    localStorage.setItem('docu_expanded_folders', JSON.stringify(['5054', 'not-a-number', '']))
    expect(() => loadPersistedExpandedFolders()).not.toThrow()
    expect(loadPersistedExpandedFolders()).toEqual(new Set([5054]))
  })

  it('does not throw on malformed JSON for the expanded-folders key', () => {
    localStorage.setItem('docu_expanded_folders', '{not json')
    expect(() => loadPersistedExpandedFolders()).not.toThrow()
    expect(loadPersistedExpandedFolders()).toEqual(new Set())
  })

  it('does not throw when browser storage rejects writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError')
    })

    expect(() => persistSelection(new Set(['5012']))).not.toThrow()
    expect(() => persistExpandedFolders(new Set([1]))).not.toThrow()
  })
})
