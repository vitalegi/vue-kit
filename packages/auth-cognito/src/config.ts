export interface AuthEndpoints {
  /** POST { code, codeVerifier } → { access_token, id_token }; il backend imposta il cookie di refresh. */
  callback: string
  /** POST con il cookie di refresh → { access_token, id_token }. */
  refresh: string
  /** Navigazione (non fetch): il backend cancella il cookie e rimanda al logout della Hosted UI. */
  logout: string
  /** GET con l'access token → dati dell'utente. */
  me: string
}

export interface CognitoAuthConfig {
  /** Dominio della Hosted UI, es. https://xxx.auth.eu-south-1.amazoncognito.com */
  cognitoDomain: string
  clientId: string
  /** URL della pagina di callback del frontend, es. https://app.example.com/callback */
  redirectUri: string
  /** Default: "openid email". */
  scope?: string
  /** Endpoint del backend; default /api/auth/{callback,refresh,logout,me}. */
  endpoints?: Partial<AuthEndpoints>
  /** Intervallo del refresh proattivo; default 5 minuti. */
  proactiveRefreshMs?: number
  /** Ricarica l'utente dopo un refresh se non è ancora noto (es. dopo un F5); default true. */
  fetchUserOnRefresh?: boolean
  /**
   * Login simulato, SOLO per lo sviluppo locale con il backend in profilo sandbox: niente Cognito,
   * ogni chiamata porta l'header {@link sandboxHeader} con questo valore.
   */
  sandboxUser?: string | undefined
  /** Default: "X-Sandbox-User". */
  sandboxHeader?: string
  /** Prefisso delle chiavi in sessionStorage (verifier, state, redirect); default "auth". */
  storageKeyPrefix?: string
  /** Id dello store Pinia; default "auth". */
  storeId?: string
  /** Navigazione del browser (login, logout); default window.location.assign. Sostituibile nei test. */
  navigate?: (url: string) => void
}

export interface ResolvedConfig {
  cognitoDomain: string
  clientId: string
  redirectUri: string
  scope: string
  endpoints: AuthEndpoints
  proactiveRefreshMs: number
  fetchUserOnRefresh: boolean
  sandboxUser: string | undefined
  sandboxHeader: string
  storeId: string
  storageKeys: { verifier: string; state: string; redirect: string }
  navigate: (url: string) => void
}

export function resolveConfig(config: CognitoAuthConfig): ResolvedConfig {
  const prefix = config.storageKeyPrefix ?? 'auth'
  return {
    cognitoDomain: config.cognitoDomain,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: config.scope ?? 'openid email',
    endpoints: {
      callback: '/api/auth/callback',
      refresh: '/api/auth/refresh',
      logout: '/api/auth/logout',
      me: '/api/auth/me',
      ...config.endpoints,
    },
    proactiveRefreshMs: config.proactiveRefreshMs ?? 5 * 60 * 1000,
    fetchUserOnRefresh: config.fetchUserOnRefresh ?? true,
    sandboxUser: config.sandboxUser || undefined,
    sandboxHeader: config.sandboxHeader ?? 'X-Sandbox-User',
    storeId: config.storeId ?? 'auth',
    storageKeys: {
      verifier: `${prefix}.pkce_verifier`,
      state: `${prefix}.oauth_state`,
      redirect: `${prefix}.post_login_redirect`,
    },
    navigate: config.navigate ?? ((url) => window.location.assign(url)),
  }
}
