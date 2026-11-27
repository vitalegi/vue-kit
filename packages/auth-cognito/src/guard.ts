import type { RouteLocationNormalized, RouteLocationRaw, Router } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** La pagina richiede una sessione: senza, la guard reindirizza. */
    requiresAuth?: boolean
  }
}

export interface AuthGuardStore {
  readonly isAuthenticated: boolean
  refresh(): Promise<boolean>
}

export interface AuthGuardOptions {
  /** Dove mandare chi apre una pagina protetta senza sessione; default { name: 'home' }. */
  redirectTo?: RouteLocationRaw | ((to: RouteLocationNormalized) => RouteLocationRaw)
}

/**
 * Al primo ingresso prova a ripristinare la sessione dal cookie di refresh (una sola volta, anche se
 * la navigazione parte prima che finisca), poi protegge le rotte con `meta.requiresAuth`.
 */
export function installAuthGuard(router: Router, useStore: () => AuthGuardStore, options: AuthGuardOptions = {}) {
  let bootstrap: Promise<boolean> | null = null
  const redirectTo = options.redirectTo ?? { name: 'home' }

  return router.beforeEach(async (to) => {
    const auth = useStore()
    bootstrap ??= auth.refresh().catch(() => false)
    await bootstrap
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return typeof redirectTo === 'function' ? redirectTo(to) : redirectTo
    }
    return true
  })
}
