import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { SessionExpiredError } from '@vitalegi/api-client'
import { createAuthenticatedApiClient, defineAuthStore } from '../index'

const Empty = { render: () => null }

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('createAuthenticatedApiClient', () => {
  const fetchMock = vi.fn<typeof fetch>()
  const useAuthStore = defineAuthStore({
    cognitoDomain: 'https://login.example.com',
    clientId: 'c',
    redirectUri: 'https://app.example.com/callback',
    navigate: vi.fn<(url: string) => void>(),
  })

  beforeEach(() => {
    setActivePinia(createPinia())
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  function routerWithPages() {
    return createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: Empty },
        { path: '/session-expired', name: 'session-expired', component: Empty },
      ],
    })
  }

  describe('given an expired session that cannot be refreshed', () => {
    it('then the store is cleared and the session-expired page is shown', async () => {
      const router = routerWithPages()
      await router.push('/')
      const auth = useAuthStore()
      auth.accessToken = 'old'
      const api = createAuthenticatedApiClient(useAuthStore, { router: () => router, baseUrl: '/api' })
      fetchMock.mockResolvedValue(json(401))

      await expect(api.json('/media/search')).rejects.toBeInstanceOf(SessionExpiredError)

      expect(auth.isAuthenticated).toBe(false)
      expect(router.currentRoute.value.name).toBe('session-expired')
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/media/search')
    })
  })

  describe('given a valid session', () => {
    it('then the store token is sent and refreshed tokens are used on retry', async () => {
      const auth = useAuthStore()
      auth.accessToken = 'old'
      const api = createAuthenticatedApiClient(useAuthStore)
      fetchMock.mockImplementation(async (url, init) => {
        if (url === '/api/auth/refresh') return json(200, { access_token: 'new', id_token: 'i' })
        if (url === '/api/auth/me') return json(200, { sub: 'u' })
        const authorization = new Headers(init?.headers).get('Authorization')
        return authorization === 'Bearer new' ? json(200, { ok: true }) : json(401)
      })

      expect(await api.json('/api/x')).toEqual({ ok: true })
      expect(auth.accessToken).toBe('new')
    })
  })
})
