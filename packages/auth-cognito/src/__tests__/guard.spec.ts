import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { installAuthGuard } from '../index'

const Empty = { render: () => null }

function setup(authenticatedAfterRefresh: boolean) {
  const auth = { isAuthenticated: false, refresh: vi.fn<() => Promise<boolean>>() }
  auth.refresh.mockImplementation(async () => {
    auth.isAuthenticated = authenticatedAfterRefresh
    return authenticatedAfterRefresh
  })
  const router: Router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Empty },
      { path: '/gallery', name: 'gallery', component: Empty, meta: { requiresAuth: true } },
      { path: '/about', name: 'about', component: Empty },
    ],
  })
  return { auth, router }
}

describe('installAuthGuard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  describe('given a valid refresh cookie', () => {
    it('then the session is restored once and protected pages open', async () => {
      const { auth, router } = setup(true)
      installAuthGuard(router, () => auth)

      await router.push('/gallery')
      await router.push('/about')
      await router.push('/gallery')

      expect(router.currentRoute.value.name).toBe('gallery')
      expect(auth.refresh).toHaveBeenCalledTimes(1)
    })
  })

  describe('given no session', () => {
    it('then protected pages redirect to the configured route and public ones open', async () => {
      const { auth, router } = setup(false)
      installAuthGuard(router, () => auth, { redirectTo: (to) => ({ name: 'home', query: { next: to.fullPath } }) })

      await router.push('/gallery?tag=1')
      expect(router.currentRoute.value.name).toBe('home')
      expect(router.currentRoute.value.query.next).toBe('/gallery?tag=1')

      await router.push('/about')
      expect(router.currentRoute.value.name).toBe('about')
    })

    it('then by default it redirects to the route named home', async () => {
      const { auth, router } = setup(false)
      installAuthGuard(router, () => auth)

      await router.push('/gallery')

      expect(router.currentRoute.value.name).toBe('home')
    })
  })
})
