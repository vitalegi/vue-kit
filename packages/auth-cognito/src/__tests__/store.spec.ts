import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineAuthStore, type CognitoAuthConfig } from '../index'

interface User {
  sub: string
  email: string
}

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()
const navigate = vi.fn<(url: string) => void>()

function store(overrides: Partial<CognitoAuthConfig> = {}) {
  const useAuthStore = defineAuthStore<User>({
    cognitoDomain: 'https://login.example.com',
    clientId: 'client-1',
    redirectUri: 'https://app.example.com/callback',
    navigate,
    ...overrides,
  })
  return useAuthStore()
}

function lastNavigation(): URL {
  return new URL(navigate.mock.calls.at(-1)?.[0] ?? '', 'https://app.example.com')
}

function callsTo(url: string) {
  return fetchMock.mock.calls.filter(([target]) => target === url)
}

describe('defineAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    fetchMock.mockReset()
    navigate.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('given an anonymous user', () => {
    it('then it is not authenticated and sends no auth header', () => {
      const auth = store()
      expect(auth.isAuthenticated).toBe(false)
      expect(auth.authHeaders()).toEqual({})
    })

    describe('when login starts', () => {
      it('then it redirects to the Hosted UI with a challenge matching the stored verifier and state', async () => {
        const auth = store()

        await auth.login()

        const url = lastNavigation()
        expect(url.origin + url.pathname).toBe('https://login.example.com/oauth2/authorize')
        expect(url.searchParams.get('scope')).toBe('openid email')
        expect(sessionStorage.getItem('auth.pkce_verifier')).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(url.searchParams.get('state')).toBe(sessionStorage.getItem('auth.oauth_state'))
        expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
      })

      it('then a social provider and the page to reopen afterwards can be requested', async () => {
        const auth = store()

        await auth.login({ provider: 'Google', redirectTo: '/invite/abc' })

        expect(lastNavigation().searchParams.get('identity_provider')).toBe('Google')
        expect(auth.takeRedirect()).toBe('/invite/abc')
        expect(auth.takeRedirect()).toBeNull()
      })
    })
  })

  describe('when the Hosted UI redirects back with a code', () => {
    async function startLogin(auth: ReturnType<typeof store>) {
      await auth.login({ redirectTo: '/boards/7' })
      return lastNavigation().searchParams.get('state')
    }

    it('then the code and verifier are exchanged, the user is loaded and the redirect returned', async () => {
      const auth = store()
      const state = await startLogin(auth)
      const verifier = sessionStorage.getItem('auth.pkce_verifier')
      fetchMock
        .mockResolvedValueOnce(json(200, { access_token: 'access-1', id_token: 'id-1' }))
        .mockResolvedValueOnce(json(200, { sub: 'u1', email: 'a@b.c' }))

      const redirect = await auth.handleCallback('code-1', state)

      const [, init] = callsTo('/api/auth/callback')[0] ?? []
      expect(JSON.parse(String(init?.body))).toEqual({ code: 'code-1', codeVerifier: verifier })
      expect(init?.credentials).toBe('include')
      expect(auth.accessToken).toBe('access-1')
      expect(auth.idToken).toBe('id-1')
      expect(auth.user).toEqual({ sub: 'u1', email: 'a@b.c' })
      expect(auth.isAuthenticated).toBe(true)
      expect(redirect).toBe('/boards/7')
      expect(sessionStorage.getItem('auth.pkce_verifier')).toBeNull()
      expect(new Headers(callsTo('/api/auth/me')[0]?.[1]?.headers).get('Authorization')).toBe('Bearer access-1')
    })

    it('then a state different from the one sent is rejected before calling the backend', async () => {
      const auth = store()
      await startLogin(auth)

      await expect(auth.handleCallback('code-1', 'forged')).rejects.toThrow('Stato OAuth non valido')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('then a missing verifier is reported', async () => {
      await expect(store().handleCallback('code-1', null)).rejects.toThrow('PKCE verifier mancante')
    })

    it('then a failed exchange is reported and leaves the user anonymous', async () => {
      const auth = store()
      const state = await startLogin(auth)
      fetchMock.mockResolvedValue(json(400))

      await expect(auth.handleCallback('code-1', state)).rejects.toThrow('Callback fallito')
      expect(auth.isAuthenticated).toBe(false)
    })
  })

  describe('when the session is refreshed', () => {
    it('then concurrent calls share a single request and the user is loaded once', async () => {
      const auth = store()
      fetchMock.mockImplementation(async (url) =>
        url === '/api/auth/refresh' ? json(200, { access_token: 'a2', id_token: 'i2' }) : json(200, { sub: 'u1' }),
      )

      const results = await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()])

      expect(results).toEqual([true, true, true])
      expect(callsTo('/api/auth/refresh')).toHaveLength(1)
      expect(callsTo('/api/auth/me')).toHaveLength(1)
      expect(auth.accessToken).toBe('a2')
    })

    it('then a rejected cookie returns false without throwing', async () => {
      const auth = store()
      fetchMock.mockResolvedValue(json(401))

      expect(await auth.refresh()).toBe(false)
      expect(auth.isAuthenticated).toBe(false)
    })

    it('then a network error returns false', async () => {
      const auth = store()
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

      expect(await auth.refresh()).toBe(false)
    })

    it('then the user is not reloaded when disabled by configuration', async () => {
      const auth = store({ fetchUserOnRefresh: false })
      fetchMock.mockResolvedValue(json(200, { access_token: 'a2', id_token: 'i2' }))

      await auth.refresh()

      expect(callsTo('/api/auth/me')).toHaveLength(0)
    })
  })

  describe('given custom endpoints', () => {
    it('then they are used for refresh, user and logout', async () => {
      const auth = store({
        endpoints: { refresh: '/api/session/refresh', me: '/api/users/me', logout: '/api/session/logout' },
      })
      fetchMock.mockImplementation(async (url) =>
        url === '/api/session/refresh' ? json(200, { access_token: 'a2', id_token: 'i2' }) : json(200, { sub: 'u1' }),
      )

      await auth.refresh()
      auth.logout()

      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/session/refresh', '/api/users/me'])
      expect(navigate).toHaveBeenLastCalledWith('/api/session/logout')
    })
  })

  describe('given an authenticated user', () => {
    async function loggedIn(overrides: Partial<CognitoAuthConfig> = {}) {
      const auth = store(overrides)
      fetchMock.mockImplementation(async (url) =>
        url === '/api/auth/refresh' ? json(200, { access_token: 'a1', id_token: 'i1' }) : json(200, { sub: 'u1' }),
      )
      await auth.refresh()
      fetchMock.mockClear()
      return auth
    }

    it('then the bearer token is sent', async () => {
      expect((await loggedIn()).authHeaders()).toEqual({ Authorization: 'Bearer a1' })
    })

    it('then the proactive refresh renews the token periodically until stopped', async () => {
      vi.useFakeTimers()
      const auth = await loggedIn({ proactiveRefreshMs: 1000 })

      auth.startProactiveRefresh()
      await vi.advanceTimersByTimeAsync(2500)
      expect(callsTo('/api/auth/refresh')).toHaveLength(2)

      auth.stopProactiveRefresh()
      await vi.advanceTimersByTimeAsync(5000)
      expect(callsTo('/api/auth/refresh')).toHaveLength(2)
    })

    it('then an expired session is cleared locally, without leaving the app', async () => {
      const auth = await loggedIn()

      auth.expireSession()

      expect(auth.isAuthenticated).toBe(false)
      expect(auth.user).toBeNull()
      expect(navigate).not.toHaveBeenCalled()
    })

    it('then logout clears the session and navigates to the backend logout (which also ends the Hosted UI session)', async () => {
      const auth = await loggedIn()

      auth.logout()

      expect(auth.isAuthenticated).toBe(false)
      expect(navigate).toHaveBeenCalledWith('/api/auth/logout')
    })
  })

  describe('given the page to reopen after login', () => {
    it('then only same-origin paths are accepted', () => {
      const auth = store()
      for (const unsafe of ['//evil.example.com', 'https://evil.example.com', 'boards', '/\\evil.example.com']) {
        auth.rememberRedirect(unsafe)
        expect(auth.takeRedirect()).toBeNull()
      }
      auth.rememberRedirect('/boards?tab=2')
      expect(auth.takeRedirect()).toBe('/boards?tab=2')
    })
  })

  describe('given the sandbox user (local development only)', () => {
    it('then it is authenticated through the sandbox header, without Cognito', async () => {
      const auth = store({ sandboxUser: 'giorgio' })
      fetchMock.mockResolvedValue(json(200, { sub: 'giorgio' }))

      expect(await auth.refresh()).toBe(true)
      expect(auth.isAuthenticated).toBe(true)
      expect(auth.authHeaders()).toEqual({ 'X-Sandbox-User': 'giorgio' })
      expect(callsTo('/api/auth/refresh')).toHaveLength(0)
      expect(auth.user).toEqual({ sub: 'giorgio' })
    })
  })

  describe('given two apps on the same origin', () => {
    it('then a storage prefix keeps their PKCE data apart', async () => {
      await store({ storageKeyPrefix: 'spesucce' }).login()
      expect(sessionStorage.getItem('spesucce.pkce_verifier')).not.toBeNull()
      expect(sessionStorage.getItem('auth.pkce_verifier')).toBeNull()
    })
  })
})
