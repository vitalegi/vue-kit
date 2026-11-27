# @vitalegi/auth-cognito

Login su AWS Cognito per app Vue: Hosted UI con Authorization Code + PKCE. Contiene:

- store Pinia;
- guard del router;
- client API già collegato alla sessione.

Dipendenze richieste nell'app (peer dependencies): `vue`, `pinia`, `vue-router`.

## Come funziona

- **Login.** Navigazione verso la Hosted UI con `code_challenge` (S256) e `state` casuale. Verifier, state e pagina da riaprire restano in `sessionStorage`.
- **Callback.** La pagina `/callback` del frontend passa `code` e `state` a `handleCallback`, che:
  1. verifica lo `state`;
  2. scambia il codice tramite il backend (`POST /api/auth/callback`);
  3. carica l'utente (`GET /api/auth/me`);
  4. restituisce la pagina da riaprire.
- **Token.** Restano **solo in memoria**. Dopo un ricaricamento la sessione si ripristina dal cookie di refresh httpOnly gestito dal backend (`POST /api/auth/refresh`). Chiamate di refresh contemporanee condividono la stessa richiesta.
- **Refresh proattivo.** Ogni 5 minuti, solo mentre c'è una sessione.
- **Logout.** Navigazione reale verso `/api/auth/logout`: il backend cancella il cookie e chiude anche la sessione della Hosted UI.
- **Sessione scaduta.** Pulizia locale, senza toccare la sessione della Hosted UI.

## Uso

```ts
// src/stores/auth.ts
import { defineAuthStore } from '@vitalegi/auth-cognito'

export interface AuthUser {
  sub: string
  email: string
}

export const useAuthStore = defineAuthStore<AuthUser>({
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  redirectUri: import.meta.env.VITE_REDIRECT_URI ?? `${window.location.origin}/callback`,
})
```

```ts
// src/api.ts
import { createAuthenticatedApiClient } from '@vitalegi/auth-cognito'
import router from './router'
import { useAuthStore } from './stores/auth'

// il router si passa come funzione: evita l'import circolare router → store → api → router
export const api = createAuthenticatedApiClient(useAuthStore, { router: () => router, baseUrl: '/api' })
```

```ts
// src/router/index.ts
import { installAuthGuard } from '@vitalegi/auth-cognito'

const router = createRouter({
  routes: [
    { path: '/gallery/:mediaId?', component: GalleryView, meta: { requiresAuth: true } },
    { path: '/session-expired', name: 'session-expired', component: SessionExpiredView },
    // ...
  ],
})
installAuthGuard(router, useAuthStore) // senza sessione → { name: 'home' }
```

```ts
// CallbackView.vue
const auth = useAuthStore()
const redirect = await auth.handleCallback(String(route.query.code), route.query.state as string | null)
auth.startProactiveRefresh()
await router.replace(redirect ?? { name: 'gallery' })
```

```ts
// main.ts: refresh proattivo anche quando la sessione viene ripristinata dal cookie
useAuthStore().startProactiveRefresh()
```

Altre azioni utili:

- `auth.login({ provider: 'Google' })` per il login social;
- `auth.login({ redirectTo: '/invite/abc' })` per riaprire una pagina dopo il login;
- `auth.logout()`;
- `auth.isAuthenticated`, `auth.user`, `auth.authHeaders()`.

## Configurazione

| Opzione                                    | Default                                  | Note                                                                  |
| ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------- |
| `cognitoDomain`, `clientId`, `redirectUri` | —                                        | obbligatorie                                                          |
| `scope`                                    | `openid email`                           |                                                                       |
| `endpoints`                                | `/api/auth/{callback,refresh,logout,me}` | es. `{ me: '/api/users/me' }`                                         |
| `proactiveRefreshMs`                       | 5 minuti                                 | `0` disattiva                                                         |
| `fetchUserOnRefresh`                       | `true`                                   | ricarica l'utente dopo un refresh se non è noto (es. dopo F5)         |
| `sandboxUser`, `sandboxHeader`             | —, `X-Sandbox-User`                      | solo sviluppo locale con il backend in profilo sandbox                |
| `storageKeyPrefix`                         | `auth`                                   | chiavi in `sessionStorage`; diverso per ogni app sulla stessa origine |
| `storeId`                                  | `auth`                                   | id dello store Pinia                                                  |
| `navigate`                                 | `window.location.assign`                 | sostituibile nei test                                                 |

## Migrare da pathfinder-fe e spesucce-fe

| Prima                                                                               | Dopo                                                                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `stores/auth.ts` scritto a mano                                                     | `defineAuthStore<AuthUser>({...})`                                                                                                |
| `handleCallback(code)`                                                              | `handleCallback(code, state)`: lo `state` arriva dalla query della callback e viene verificato; restituisce la pagina da riaprire |
| `loginWithProvider('Google')`                                                       | `login({ provider: 'Google' })`                                                                                                   |
| `sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, path)` + `takePostLoginRedirect()` | `login({ redirectTo: path })` oppure `rememberRedirect(path)`; la pagina arriva da `handleCallback`                               |
| `apiFetch` / `apiFetchJson` / `ApiError` di `apiClient.ts`                          | `api.fetch` / `api.json` / `ApiError` di `@vitalegi/api-client` (stessa forma dell'errore di spesucce)                            |
| guard scritta in `router/index.ts`                                                  | `installAuthGuard(router, useAuthStore)`                                                                                          |
| spesucce: `/api/users/me` e `config.sandboxUser`                                    | `endpoints: { me: '/api/users/me' }`, `sandboxUser: import.meta.env.VITE_SANDBOX_USER`                                            |

Rispetto alle versioni nelle app cambiano due cose di sicurezza:

- verifica dello `state` OAuth al ritorno dalla Hosted UI;
- la pagina da riaprire dopo il login deve essere un path dello stesso sito. `//host` e `/\host` vengono scartati, perché i browser li trattano come indirizzi esterni.
