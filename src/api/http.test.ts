import { afterEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { apiGet, ApiError } from './http'

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
