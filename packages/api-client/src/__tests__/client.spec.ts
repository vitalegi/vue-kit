import { describe, expect, it, vi } from 'vitest'
import { ApiError, SessionExpiredError, createApiClient, type ApiClientOptions } from '../index.js'

function response(status: number, body: unknown = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup(overrides: Partial<ApiClientOptions> = {}) {
  let token = 'token-1'
  const fetchMock = vi.fn<typeof fetch>()
  const refresh = vi.fn<() => Promise<boolean>>(async () => {
    token = 'token-2'
    return true
  })
  const onSessionExpired = vi.fn<ApiClientOptions['onSessionExpired']>()
  const client = createApiClient({
    fetch: fetchMock,
    authHeaders: () => ({ Authorization: `Bearer ${token}` }),
    refresh,
    onSessionExpired,
    ...overrides,
  })
  const sent = (call = 0) => {
    const [url, init] = fetchMock.mock.calls[call] ?? []
    return { url, init: init ?? {}, headers: new Headers(init?.headers) }
  }
  return { client, fetchMock, refresh, onSessionExpired, sent }
}

describe('createApiClient', () => {
  describe('given an authenticated session', () => {
    describe('when the API answers 200', () => {
      it('then the auth headers and the cookies are sent, without refreshing', async () => {
        const { client, fetchMock, refresh, sent } = setup()
        fetchMock.mockResolvedValue(response(200))

        const result = await client.fetch('/api/boards')

        expect(result.status).toBe(200)
        expect(sent().headers.get('Authorization')).toBe('Bearer token-1')
        expect(sent().init.credentials).toBe('include')
        expect(refresh).not.toHaveBeenCalled()
      })
    })

    describe('when the API answers 401 and the refresh succeeds', () => {
      it('then the request is retried once with the new headers', async () => {
        const { client, fetchMock, sent } = setup()
        fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200))

        const result = await client.fetch('/api/boards', { method: 'DELETE' })

        expect(result.status).toBe(200)
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(sent(1).headers.get('Authorization')).toBe('Bearer token-2')
        expect(sent(1).init.method).toBe('DELETE')
      })
    })

    describe('when several requests get 401 at the same time', () => {
      it('then a single refresh is shared by all of them', async () => {
        let releaseRefresh: (ok: boolean) => void = () => {}
        const refresh = vi.fn<() => Promise<boolean>>(() => new Promise((resolve) => (releaseRefresh = resolve)))
        const { client, fetchMock } = setup({ refresh })
        fetchMock
          .mockResolvedValueOnce(response(401))
          .mockResolvedValueOnce(response(401))
          .mockResolvedValueOnce(response(401))
          .mockResolvedValue(response(200))

        const pending = Promise.all([client.fetch('/a'), client.fetch('/b'), client.fetch('/c')])
        await vi.waitFor(() => expect(refresh).toHaveBeenCalled())
        releaseRefresh(true)
        const results = await pending

        expect(refresh).toHaveBeenCalledTimes(1)
        expect(results.map((r) => r.status)).toEqual([200, 200, 200])
      })

      it('then a later 401, after the first refresh completed, triggers a new refresh', async () => {
        const { client, fetchMock, refresh } = setup()
        fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200))
        await client.fetch('/a')
        fetchMock.mockResolvedValueOnce(response(401)).mockResolvedValueOnce(response(200))
        await client.fetch('/b')

        expect(refresh).toHaveBeenCalledTimes(2)
      })
    })

    describe('when the API answers 401 and the refresh fails', () => {
      it('then the session expires and the request is rejected', async () => {
        const { client, fetchMock, onSessionExpired } = setup({ refresh: async () => false })
        fetchMock.mockResolvedValue(response(401))

        const error = await client.fetch('/api/boards').catch((e: unknown) => e)

        expect(error).toBeInstanceOf(SessionExpiredError)
        expect((error as SessionExpiredError).reason).toBe('refresh-failed')
        expect(onSessionExpired).toHaveBeenCalledWith('refresh-failed')
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
    })

    describe('when the refresh throws (e.g. network down)', () => {
      it('then it counts as a failed refresh', async () => {
        const { client, fetchMock, onSessionExpired } = setup({
          refresh: async () => {
            throw new TypeError('Failed to fetch')
          },
        })
        fetchMock.mockResolvedValue(response(401))

        await expect(client.fetch('/a')).rejects.toBeInstanceOf(SessionExpiredError)
        expect(onSessionExpired).toHaveBeenCalledWith('refresh-failed')
      })
    })

    describe('when the API still answers 401 after a successful refresh', () => {
      it('then the session expires as rejected (user disabled or permissions revoked)', async () => {
        const { client, fetchMock, onSessionExpired } = setup()
        fetchMock.mockResolvedValue(response(401))

        const error = await client.fetch('/api/boards').catch((e: unknown) => e)

        expect((error as SessionExpiredError).reason).toBe('rejected-after-refresh')
        expect(onSessionExpired).toHaveBeenCalledWith('rejected-after-refresh')
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('given a request that skips authentication', () => {
    it('then no auth header is sent and a 401 is returned as is', async () => {
      const { client, fetchMock, refresh, sent } = setup()
      fetchMock.mockResolvedValue(response(401))

      const result = await client.fetch('/api/public', { skipAuth: true })

      expect(result.status).toBe(401)
      expect(sent().headers.has('Authorization')).toBe(false)
      expect(refresh).not.toHaveBeenCalled()
    })
  })

  describe('given a base URL', () => {
    it('then relative paths are prefixed and absolute URLs are left alone', async () => {
      const { client, fetchMock, sent } = setup({ baseUrl: '/api/' })
      fetchMock.mockResolvedValue(response(200))

      await client.fetch('boards')
      await client.fetch('/media/search')
      await client.fetch('https://example.com/x')

      expect([sent(0).url, sent(1).url, sent(2).url]).toEqual([
        '/api/boards',
        '/api/media/search',
        'https://example.com/x',
      ])
    })
  })

  describe('given a request body', () => {
    it('then plain values are sent as JSON', async () => {
      const { client, fetchMock, sent } = setup()
      fetchMock.mockResolvedValue(response(200))

      await client.fetch('/api/expenses', { method: 'POST', body: { amount: 12.5, tags: ['a'] } })

      expect(sent().headers.get('Content-Type')).toBe('application/json')
      expect(sent().init.body).toBe('{"amount":12.5,"tags":["a"]}')
    })

    it('then text is sent as text/plain', async () => {
      const { client, fetchMock, sent } = setup()
      fetchMock.mockResolvedValue(response(200))

      await client.fetch('/api/import', { method: 'POST', text: 'a;b\n1;2' })

      expect(sent().headers.get('Content-Type')).toBe('text/plain; charset=UTF-8')
      expect(sent().init.body).toBe('a;b\n1;2')
    })

    it('then FormData is passed through so the browser sets the multipart boundary', async () => {
      const { client, fetchMock, sent } = setup()
      fetchMock.mockResolvedValue(response(200))
      const form = new FormData()
      form.append('file', new Blob(['x']), 'a.txt')

      await client.fetch('/api/upload', { method: 'POST', body: form })

      expect(sent().init.body).toBe(form)
      expect(sent().headers.has('Content-Type')).toBe(false)
    })
  })

  describe('json()', () => {
    it('then the response body is parsed', async () => {
      const { client, fetchMock } = setup()
      fetchMock.mockResolvedValue(response(200, { items: [1, 2] }))

      expect(await client.json<{ items: number[] }>('/api/x')).toEqual({ items: [1, 2] })
    })

    it('then 204 resolves to undefined', async () => {
      const { client, fetchMock } = setup()
      fetchMock.mockResolvedValue(response(204))

      expect(await client.json('/api/x', { method: 'DELETE' })).toBeUndefined()
    })

    it('then HTTP errors become ApiError with status and parsed body', async () => {
      const { client, fetchMock } = setup()
      fetchMock.mockResolvedValue(response(422, { code: 'AMOUNT_NEGATIVE' }))

      const error = await client.json('/api/x').catch((e: unknown) => e)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(422)
      expect((error as ApiError).body).toEqual({ code: 'AMOUNT_NEGATIVE' })
      expect((error as ApiError).message).toBe('Errore API: 422')
    })

    it('then a non-JSON error body is kept as text', async () => {
      const { client, fetchMock } = setup()
      fetchMock.mockResolvedValue(new Response('Bad Gateway', { status: 502 }))

      const error = (await client.json('/api/x').catch((e: unknown) => e)) as ApiError

      expect(error.body).toBe('Bad Gateway')
    })
  })
})
