import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgressTicker } from './useProgressTicker'

describe('useProgressTicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at 0 and advances roughly every 2.5s while active', () => {
    const { result } = renderHook(() => useProgressTicker(true))

    expect(result.current).toBe(0)

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(result.current).toBe(1)

    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(result.current).toBe(2)
  })

  it('does not advance while inactive', () => {
    const { result } = renderHook(() => useProgressTicker(false))

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(result.current).toBe(0)
  })

  it('stops advancing once active flips to false, keeping the last value', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useProgressTicker(active),
      { initialProps: { active: true } },
    )

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(2)

    rerender({ active: false })

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(result.current).toBe(2)
  })

  it('clears its interval on unmount — no leaked timer', () => {
    const { unmount } = renderHook(() => useProgressTicker(true))

    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the old interval before starting a new one when active toggles back on', () => {
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => useProgressTicker(active),
      { initialProps: { active: true } },
    )

    rerender({ active: false })
    rerender({ active: true })

    expect(vi.getTimerCount()).toBe(1)
  })
})
