import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVisualViewportHeight } from './useVisualViewportHeight'

/** A minimal, controllable `VisualViewport` stand-in — `height` is mutated
 * directly by the test, then `fireResize()`/`fireScroll()` dispatch the
 * same events iOS Safari fires when the on-screen keyboard opens/closes
 * (shrinking/growing the visual viewport without changing the layout
 * viewport `window.innerHeight` at all). Mirrors
 * `useMediaQuery.test.ts`'s `mockMediaQueryList` shape. */
function mockVisualViewport(initialHeight: number) {
  let height = initialHeight
  const resizeListeners = new Set<() => void>()
  const scrollListeners = new Set<() => void>()
  const viewport = {
    get height() {
      return height
    },
    addEventListener: (event: string, cb: () => void) => {
      if (event === 'resize') resizeListeners.add(cb)
      if (event === 'scroll') scrollListeners.add(cb)
    },
    removeEventListener: (event: string, cb: () => void) => {
      if (event === 'resize') resizeListeners.delete(cb)
      if (event === 'scroll') scrollListeners.delete(cb)
    },
  }
  return {
    viewport: viewport as unknown as VisualViewport,
    setHeight: (next: number) => {
      height = next
    },
    fireResize: () => resizeListeners.forEach((cb) => cb()),
    fireScroll: () => scrollListeners.forEach((cb) => cb()),
    resizeListenerCount: () => resizeListeners.size,
    scrollListenerCount: () => scrollListeners.size,
  }
}

describe('useVisualViewportHeight', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    // @ts-expect-error test-only cleanup of a property jsdom doesn't define
    delete window.visualViewport
  })

  it('returns undefined when window.visualViewport is not available, instead of throwing', () => {
    expect(() => renderHook(() => useVisualViewportHeight())).not.toThrow()
    const { result } = renderHook(() => useVisualViewportHeight())
    expect(result.current).toBeUndefined()
  })

  it('returns the current visualViewport.height on mount', () => {
    const { viewport } = mockVisualViewport(650)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const { result } = renderHook(() => useVisualViewportHeight())

    expect(result.current).toBe(650)
  })

  it('updates on the visualViewport resize event — the keyboard-open shrink', () => {
    const { viewport, setHeight, fireResize } = mockVisualViewport(650)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const { result } = renderHook(() => useVisualViewportHeight())
    expect(result.current).toBe(650)

    act(() => {
      setHeight(340)
      fireResize()
    })

    expect(result.current).toBe(340)
  })

  it('updates on the visualViewport scroll event', () => {
    const { viewport, setHeight, fireScroll } = mockVisualViewport(650)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const { result } = renderHook(() => useVisualViewportHeight())

    act(() => {
      setHeight(500)
      fireScroll()
    })

    expect(result.current).toBe(500)
  })

  it('removes both listeners on unmount', () => {
    const { viewport, resizeListenerCount, scrollListenerCount } = mockVisualViewport(650)
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })

    const { unmount } = renderHook(() => useVisualViewportHeight())
    expect(resizeListenerCount()).toBe(1)
    expect(scrollListenerCount()).toBe(1)

    unmount()

    expect(resizeListenerCount()).toBe(0)
    expect(scrollListenerCount()).toBe(0)
  })
})
