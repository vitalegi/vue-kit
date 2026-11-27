import { defineStore } from 'pinia'
import { computed, ref, type Ref } from 'vue'
import { resolveConfig, type CognitoAuthConfig } from './config'
import { buildAuthorizeUrl, generateCodeChallenge, generateRandomString } from './pkce'

interface TokenResponse {
  access_token: string
  id_token?: string
}

export interface LoginOptions {
  /** Provider federato in Cognito (es. "Google", "SignInWithApple", "Facebook"): salta la scelta nella Hosted UI. */
  provider?: string
  /** Pagina da riaprire dopo il login (path dello stesso sito, es. "/invite/abc"). */
  redirectTo?: string
}

/** Solo path relativi allo stesso sito: niente "//host" o "/\host", che i browser trattano come URL esterni. */
function isSafeRedirect(path: string | null): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\')
}

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Store Pinia dell'autenticazione Cognito (Hosted UI + Authorization Code con PKCE).
 * I token restano solo in memoria; la sessione sopravvive a un ricaricamento grazie al cookie di refresh
 * httpOnly gestito dal backend (vedi {@link CognitoAuthConfig.endpoints}).
 *
 * @typeParam TUser forma dei dati restituiti dall'endpoint "me"
 */
export function defineAuthStore<TUser = unknown>(config: CognitoAuthConfig) {
  const cfg = resolveConfig(config)

  return defineStore(cfg.storeId, () => {
    const accessToken = ref<string | null>(null)
    const idToken = ref<string | null>(null)
    const user = ref(null) as Ref<TUser | null>
    let refreshPromise: Promise<boolean> | null = null
    let refreshTimer: ReturnType<typeof setInterval> | null = null

    const isAuthenticated = computed(() => !!accessToken.value || !!cfg.sandboxUser)

    /** Header di autenticazione per le chiamate al backend. */
    function authHeaders(): Record<string, string> {
      if (cfg.sandboxUser) return { [cfg.sandboxHeader]: cfg.sandboxUser }
      return accessToken.value ? { Authorization: `Bearer ${accessToken.value}` } : {}
    }

    function rememberRedirect(path: string) {
      storage()?.setItem(cfg.storageKeys.redirect, path)
    }

    /** Legge e cancella la pagina da riaprire dopo il login; null se assente o non sicura. */
    function takeRedirect(): string | null {
      const s = storage()
      const path = s?.getItem(cfg.storageKeys.redirect) ?? null
      s?.removeItem(cfg.storageKeys.redirect)
      return isSafeRedirect(path) ? path : null
    }

    /** Avvia il login sulla Hosted UI (navigazione reale del browser). */
    async function login(options: LoginOptions = {}) {
      if (options.redirectTo) rememberRedirect(options.redirectTo)
      const verifier = generateRandomString()
      const state = generateRandomString()
      storage()?.setItem(cfg.storageKeys.verifier, verifier)
      storage()?.setItem(cfg.storageKeys.state, state)
      cfg.navigate(
        buildAuthorizeUrl({
          cognitoDomain: cfg.cognitoDomain,
          clientId: cfg.clientId,
          redirectUri: cfg.redirectUri,
          scope: cfg.scope,
          codeChallenge: await generateCodeChallenge(verifier),
          state,
          extraParams: options.provider ? { identity_provider: options.provider } : {},
        }),
      )
    }

    function setTokens(data: TokenResponse) {
      accessToken.value = data.access_token
      idToken.value = data.id_token ?? null
    }

    /**
     * Completa il login dalla pagina di callback (`code` e `state` dalla query string).
     * @returns la pagina da riaprire, se era stata richiesta con {@link LoginOptions.redirectTo}
     */
    async function handleCallback(code: string, state: string | null | undefined): Promise<string | null> {
      const s = storage()
      const verifier = s?.getItem(cfg.storageKeys.verifier)
      if (!verifier) throw new Error('PKCE verifier mancante')
      const expectedState = s?.getItem(cfg.storageKeys.state)
      if (expectedState && state !== expectedState) throw new Error('Stato OAuth non valido')

      const response = await fetch(cfg.endpoints.callback, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code, codeVerifier: verifier }),
      })
      if (!response.ok) throw new Error('Callback fallito')

      setTokens((await response.json()) as TokenResponse)
      s?.removeItem(cfg.storageKeys.verifier)
      s?.removeItem(cfg.storageKeys.state)
      await fetchMe()
      return takeRedirect()
    }

    /** Rigenera l'access token dal cookie di refresh; chiamate concorrenti condividono la stessa richiesta. */
    function refresh(): Promise<boolean> {
      if (cfg.sandboxUser) {
        return (async () => {
          if (!user.value) await fetchMe()
          return true
        })()
      }
      refreshPromise ??= (async () => {
        try {
          const response = await fetch(cfg.endpoints.refresh, { method: 'POST', credentials: 'include' })
          if (!response.ok) return false
          setTokens((await response.json()) as TokenResponse)
          if (cfg.fetchUserOnRefresh && !user.value) await fetchMe()
          return true
        } catch {
          return false
        } finally {
          refreshPromise = null
        }
      })()
      return refreshPromise
    }

    /** Rinnova il token a intervalli regolari, solo mentre c'è una sessione. */
    function startProactiveRefresh() {
      stopProactiveRefresh()
      if (cfg.proactiveRefreshMs <= 0) return
      refreshTimer = setInterval(() => {
        if (accessToken.value) void refresh()
      }, cfg.proactiveRefreshMs)
    }

    function stopProactiveRefresh() {
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
    }

    /** Sessione scaduta: pulizia locale, senza toccare la sessione della Hosted UI. */
    function expireSession() {
      accessToken.value = null
      idToken.value = null
      user.value = null
      stopProactiveRefresh()
    }

    /** Logout esplicito: navigazione reale per seguire i redirect backend → Cognito → frontend. */
    function logout() {
      expireSession()
      cfg.navigate(cfg.endpoints.logout)
    }

    async function fetchMe(): Promise<TUser | null> {
      const response = await fetch(cfg.endpoints.me, { headers: authHeaders(), credentials: 'include' })
      if (response.ok) user.value = (await response.json()) as TUser
      return user.value
    }

    return {
      accessToken,
      idToken,
      user,
      isAuthenticated,
      authHeaders,
      login,
      handleCallback,
      refresh,
      startProactiveRefresh,
      stopProactiveRefresh,
      expireSession,
      logout,
      fetchMe,
      rememberRedirect,
      takeRedirect,
    }
  })
}

/** Tipo dello store restituito da `defineAuthStore<TUser>(...)()`. */
export type AuthStore<TUser = unknown> = ReturnType<ReturnType<typeof defineAuthStore<TUser>>>
