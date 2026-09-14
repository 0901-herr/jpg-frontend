import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElapsedSeconds } from './useElapsedSeconds'

describe('useElapsedSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-14T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at 0 and ticks up once a second while active', () => {
    const startedAt = Date.now()
    const { result } = renderHook(() => useElapsedSeconds(startedAt, true))

    expect(result.current).toBe(0)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current).toBe(1)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBe(4)
  })

  it('does not tick while inactive', () => {
    const startedAt = Date.now()
    const { result } = renderHook(() => useElapsedSeconds(startedAt, false))

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(0)
  })

  it('stops ticking once active flips to false, keeping the last value', () => {
    const startedAt = Date.now()
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useElapsedSeconds(startedAt, active),
      { initialProps: { active: true } },
    )

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBe(2)

    rerender({ active: false })

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(2)
  })

  it('computes elapsed time relative to a startedAt in the past', () => {
    const startedAt = Date.now() - 7000
    const { result } = renderHook(() => useElapsedSeconds(startedAt, true))

    expect(result.current).toBe(7)
  })
})
