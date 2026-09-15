import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

/** A minimal, controllable `MediaQueryList` stand-in: `matches` is mutated
 * directly by the test, then `fireChange()` dispatches the same `change`
 * event a real browser would fire when the viewport crosses the query's
 * breakpoint. */
function mockMediaQueryList(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<() => void>()
  const mql = {
    get matches() {
      return matches
    },
    media: '',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_event: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_event: string, cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  }
  return {
    mql: mql as unknown as MediaQueryList,
    setMatches: (next: boolean) => {
      matches = next
    },
    fireChange: () => listeners.forEach((cb) => cb()),
  }
}

describe('useMediaQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the current match state from matchMedia on mount', () => {
    const { mql } = mockMediaQueryList(true)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)

    const { result } = renderHook(() => useMediaQuery('(max-width: 767.98px)'))

    expect(result.current).toBe(true)
  })

  it('updates when the media query change event fires', () => {
    const { mql, setMatches, fireChange } = mockMediaQueryList(false)
    vi.spyOn(window, 'matchMedia').mockReturnValue(mql)

    const { result } = renderHook(() => useMediaQuery('(max-width: 767.98px)'))
    expect(result.current).toBe(false)

    act(() => {
      setMatches(true)
      fireChange()
    })

    expect(result.current).toBe(true)
  })

  it('returns false when matchMedia is unavailable, instead of throwing', () => {
    const original = window.matchMedia
    // @ts-expect-error simulating an environment without matchMedia
    delete window.matchMedia

    expect(() => renderHook(() => useMediaQuery('(max-width: 767.98px)'))).not.toThrow()
    const { result } = renderHook(() => useMediaQuery('(max-width: 767.98px)'))
    expect(result.current).toBe(false)

    window.matchMedia = original
  })
})
