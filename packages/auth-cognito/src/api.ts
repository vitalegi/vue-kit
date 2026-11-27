import { createApiClient, type ApiClient, type SessionExpiredReason } from '@vitalegi/api-client'
import type { RouteLocationRaw, Router } from 'vue-router'

export interface SessionStore {
  authHeaders(): Record<string, string>
  refresh(): Promise<boolean>
  expireSession(): void
}

export interface AuthenticatedApiClientOptions {
  /** Prefisso dei path relativi, es. "/api". */
  baseUrl?: string
  /** Router, passato come funzione per evitare import circolari (router → store → client → router). */
  router?: () => Router
  /** Pagina da mostrare a sessione scaduta; default { name: 'session-expired' }. Ignorata senza router. */
  sessionExpiredRoute?: RouteLocationRaw
  /** Azioni aggiuntive a sessione scaduta (dopo la pulizia dello store). */
  onSessionExpired?: (reason: SessionExpiredReason) => void | Promise<void>
}

/** Client API collegato allo store di autenticazione: header, refresh e gestione della sessione scaduta. */
export function createAuthenticatedApiClient(
  useStore: () => SessionStore,
  options: AuthenticatedApiClientOptions = {},
): ApiClient {
  return createApiClient({
    ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
    authHeaders: () => useStore().authHeaders(),
    refresh: () => useStore().refresh(),
    onSessionExpired: async (reason) => {
      useStore().expireSession()
      const router = options.router?.()
      if (router) await router.push(options.sessionExpiredRoute ?? { name: 'session-expired' })
      await options.onSessionExpired?.(reason)
    },
  })
}
