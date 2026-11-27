# @vitalegi/api-client

Wrapper su `fetch` per chiamare il proprio backend. È TypeScript puro e non dipende da Vue.

## Cosa fa

- Aggiunge gli header di autenticazione a ogni richiesta e invia i cookie (`credentials: 'include'`).
- Su **401** rinnova la sessione e ripete la richiesta **una volta**. Più 401 che arrivano insieme condividono **un solo** refresh.
- Se la sessione non è recuperabile, chiama `onSessionExpired` e rifiuta la richiesta con `SessionExpiredError`. Il motivo è uno dei due:
  - `refresh-failed`: il refresh non è riuscito;
  - `rejected-after-refresh`: il refresh è riuscito, ma l'API rifiuta comunque.
- Gestisce il corpo della richiesta:
  - `body` di tipo `FormData`, `Blob`, `URLSearchParams` o binario viene inviato così com'è (upload);
  - qualunque altro `body` viene serializzato in JSON;
  - `text` viene inviato come `text/plain`.
- `json<T>()` interpreta la risposta come JSON:
  - status non 2xx → `ApiError` con `status` e `body` (JSON se possibile, altrimenti testo);
  - 204 → `undefined`.

## Uso

Nelle app con Cognito non si usa direttamente: lo crea `createAuthenticatedApiClient` di `@vitalegi/auth-cognito`, già collegato allo store. Uso diretto:

```ts
import { createApiClient, ApiError } from '@vitalegi/api-client'

export const api = createApiClient({
  baseUrl: '/api',
  authHeaders: () => (token ? { Authorization: `Bearer ${token}` } : {}),
  refresh: async () => {
    /* rinnova il token; true se è riuscito */
    return false
  },
  onSessionExpired: (reason) => {
    /* pulizia e navigazione alla pagina di sessione scaduta */
  },
})

const page = await api.json<PageResponse<Media>>('/media/search', { method: 'POST', body: { pageSize: 60 } })
await api.fetch('/import', { method: 'POST', text: csv })
await api.fetch('/public/status', { skipAuth: true })
```

Con `baseUrl: '/api'`:

- i path relativi ricevono il prefisso;
- i path che lo contengono già (`/api/...`) e gli URL assoluti restano invariati.
