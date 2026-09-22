import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { apiGet, ApiError, consumeSseStream } from './http'
import type { SseEvent } from './http'

/** A scripted `ReadableStreamDefaultReader`-alike whose `read()` resolves
 * after `delayMs` on the currently active clock (real or fake) — lets a
 * test control exactly how much wall-clock time elapses between chunks
 * without any real waiting. */
function scriptedReader(chunks: Array<{ delayMs: number; text: string }>) {
  const encoder = new TextEncoder()
  let index = 0
  return {
    read: (): Promise<ReadableStreamReadResult<Uint8Array>> =>
      new Promise((resolve) => {
        const chunk = chunks[index]
        setTimeout(() => {
          if (!chunk) {
            resolve({ done: true, value: undefined })
            return
          }
          index++
          resolve({ done: false, value: encoder.encode(chunk.text) })
        }, chunk?.delayMs ?? 0)
      }),
    cancel: async () => {},
  }
}

function responseWithReader(reader: ReturnType<typeof scriptedReader>): Response {
  return { body: { getReader: () => reader } } as unknown as Response
}

describe('apiGet error parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads the message from a {detail} error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 })),
    )

    const error = await apiGet('/thing').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).detail).toBe('Not found')
    expect((error as ApiError).message).toBe('Not found')
  })

  it('reads the message from an {error} error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })),
    )

    const error = await apiGet('/thing').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(403)
    expect((error as ApiError).detail).toBe('Forbidden')
    expect((error as ApiError).message).toBe('Forbidden')
  })

  it('reads the code and message from a {error, message} body, keeping both distinct', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: 'leaf_folder', message: 'This folder has no subfolders.' }),
            { status: 409 },
          ),
      ),
    )

    const error = await apiGet('/thing').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).code).toBe('leaf_folder')
    expect((error as ApiError).detail).toBe('This folder has no subfolders.')
    expect((error as ApiError).message).toBe('This folder has no subfolders.')
  })

  it('still exposes the {error} code alongside detail when no message is present', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ error: 'feature_disabled' }), { status: 404 }),
      ),
    )

    const error = await apiGet('/thing').catch((e: unknown) => e)

    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).code).toBe('feature_disabled')
    expect((error as ApiError).detail).toBe('feature_disabled')
  })

  it('falls back to the response status text for a non-JSON body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html>Bad Gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
      ),
    )

    const error = await apiGet('/thing').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
    expect((error as ApiError).detail).toBeUndefined()
    expect((error as ApiError).message).toBe('Bad Gateway')
  })
})

describe('consumeSseStream inactivity timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats a keepalive comment line as activity, resetting the timer, and still parses the surrounding data byte-identically', async () => {
    // Two real `data:` chunks 90s apart (over the old 45s timeout) with a
    // `: ping` keepalive-only chunk in between, also 90s after the first —
    // every read (ping included) must reset the 120s timer for this to
    // finish without throwing.
    const reader = scriptedReader([
      { delayMs: 0, text: 'data: {"a":1}\n\n' },
      { delayMs: 90_000, text: ': ping\n\n' },
      { delayMs: 90_000, text: 'data: {"b":2}\n\n' },
    ])
    const events: SseEvent[] = []

    const promise = consumeSseStream(responseWithReader(reader), (event) => events.push(event))

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(90_000)
    await vi.advanceTimersByTimeAsync(90_000)
    // Flushes the final (immediate) read that ends the stream.
    await vi.runAllTimersAsync()

    await promise

    expect(events).toEqual([
      { event: 'message', data: { a: 1 } },
      { event: 'message', data: { b: 2 } },
    ])
  })

  it('throws the plain-language stall message when no bytes arrive for 120s', async () => {
    const reader = scriptedReader([{ delayMs: 200_000, text: 'data: {"a":1}\n\n' }])

    const promise = consumeSseStream(responseWithReader(reader), () => {})
    const assertion = expect(promise).rejects.toMatchObject({
      message: 'The answer is taking longer than expected. Please try again.',
      status: 504,
    })

    await vi.advanceTimersByTimeAsync(120_000)
    await assertion
  })

  it('does not stall within 120s of a single keepalive comment with nothing else, and finishes once the stream ends', async () => {
    const reader = scriptedReader([{ delayMs: 100_000, text: ': ping\n\n' }])
    const events: SseEvent[] = []

    const promise = consumeSseStream(responseWithReader(reader), (event) => events.push(event))

    await vi.advanceTimersByTimeAsync(100_000)
    // Stream ends (reader.read() resolves done:true) right after the ping.
    await vi.runAllTimersAsync()

    await promise
    expect(events).toEqual([])
  })
})

describe('consumeSseStream terminal events', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops reading and cancels the reader once the handler reports a terminal event, even when the server never closes the stream', async () => {
    // Regression (live, 2026-09-22): the adapter delivered every `answer`
    // segment and then — through a server-side stall — never closed the
    // response. The UI waited for end-of-stream to finish the message, so
    // the answer sat on screen with a blinking cursor and an active Stop
    // button until a refresh. `done` is the contract's terminal event: the
    // stream is over when it arrives, whatever the socket does afterwards.
    const reader = scriptedReader([
      { delayMs: 0, text: 'event: answer\ndata: {"answer":"hi"}\n\n' },
      { delayMs: 0, text: 'event: done\ndata: {"duration_ms":5}\n\n' },
      // A server that hangs after `done`: this read never resolves in time.
      { delayMs: 10_000_000, text: ': never\n\n' },
    ])
    const cancel = vi.spyOn(reader, 'cancel')
    const events: SseEvent[] = []

    const promise = consumeSseStream(responseWithReader(reader), (event) => {
      events.push(event)
      return event.event === 'done'
    })

    // Runs every pending timer: if reading did NOT stop at `done`, the
    // 120s inactivity timer fires first and this rejects with the stall
    // message instead of resolving.
    await vi.runAllTimersAsync()
    await promise

    expect(events.map((e) => e.event)).toEqual(['answer', 'done'])
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it('keeps reading to end-of-stream when the handler never reports a terminal event', async () => {
    const reader = scriptedReader([
      { delayMs: 0, text: 'data: {"a":1}\n\n' },
      { delayMs: 0, text: 'data: {"b":2}\n\n' },
    ])
    const cancel = vi.spyOn(reader, 'cancel')
    const events: SseEvent[] = []

    const promise = consumeSseStream(responseWithReader(reader), (event) => {
      events.push(event)
    })
    await vi.runAllTimersAsync()
    await promise

    expect(events).toHaveLength(2)
    expect(cancel).not.toHaveBeenCalled()
  })
})
