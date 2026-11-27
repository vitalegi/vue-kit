import { ApiError, SessionExpiredError, type SessionExpiredReason } from './errors.js'

export interface ApiClientOptions {
  /** Prefisso dei path relativi, es. "/api". Gli URL assoluti (http/https) restano invariati. */
  baseUrl?: string
  /** Header di autenticazione correnti (letti a ogni tentativo, quindi già aggiornati dopo un refresh). */
  authHeaders: () => Record<string, string>
  /** Rinnova la sessione; true se è riuscito. Più 401 contemporanei condividono una sola chiamata. */
  refresh: () => Promise<boolean>
  /** Chiamato quando la sessione non è più recuperabile, prima di rifiutare la richiesta. */
  onSessionExpired: (reason: SessionExpiredReason) => void | Promise<void>
  /** fetch da usare (default: quello globale, letto a ogni chiamata). */
  fetch?: typeof fetch
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Non invia gli header di autenticazione e non gestisce i 401. */
  skipAuth?: boolean
  /**
   * Corpo della richiesta. FormData, Blob, URLSearchParams, ArrayBuffer e stream vengono inviati così come sono;
   * qualunque altro valore viene serializzato in JSON.
   */
  body?: unknown
  /** Corpo inviato come text/plain (es. un CSV da importare). Alternativo a `body`. */
  text?: string
}

export interface ApiClient {
  /** fetch con autenticazione e un tentativo di refresh su 401. Non interpreta lo status (tranne 401). */
  fetch(url: string, options?: RequestOptions): Promise<Response>
  /** Come {@link fetch}, poi interpreta la risposta come JSON; status non 2xx → {@link ApiError}, 204 → undefined. */
  json<T>(url: string, options?: RequestOptions): Promise<T>
}

function isRawBody(body: unknown): body is BodyInit {
  return (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof URLSearchParams ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
  )
}

function resolveUrl(baseUrl: string | undefined, url: string): string {
  if (!baseUrl || /^https?:\/\//i.test(url)) return url
  if (url.startsWith(baseUrl.replace(/\/$/, '') + '/')) return url
  return `${baseUrl.replace(/\/$/, '')}/${url.replace(/^\//, '')}`
}

async function readErrorBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => '')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  let pendingRefresh: Promise<boolean> | null = null

  /** Un solo refresh alla volta: le richieste che ricevono 401 nel frattempo attendono lo stesso esito. */
  function sharedRefresh(): Promise<boolean> {
    pendingRefresh ??= options
      .refresh()
      .catch(() => false)
      .finally(() => {
        pendingRefresh = null
      })
    return pendingRefresh
  }

  async function expire(reason: SessionExpiredReason): Promise<never> {
    await options.onSessionExpired(reason)
    throw new SessionExpiredError(reason)
  }

  async function apiFetch(url: string, requestOptions: RequestOptions = {}): Promise<Response> {
    const { skipAuth, body, text, ...init } = requestOptions
    const target = resolveUrl(options.baseUrl, url)

    const send = () => {
      const headers = new Headers(init.headers)
      if (!skipAuth) {
        for (const [name, value] of Object.entries(options.authHeaders())) headers.set(name, value)
      }
      let payload: BodyInit | undefined
      if (text !== undefined) {
        headers.set('Content-Type', 'text/plain; charset=UTF-8')
        payload = text
      } else if (isRawBody(body)) {
        payload = body
      } else if (body !== undefined) {
        headers.set('Content-Type', 'application/json')
        payload = JSON.stringify(body)
      }
      const doFetch = options.fetch ?? globalThis.fetch
      return doFetch(target, { ...init, headers, body: payload, credentials: init.credentials ?? 'include' })
    }

    const response = await send()
    if (response.status !== 401 || skipAuth) return response

    if (!(await sharedRefresh())) return expire('refresh-failed')

    const retried = await send()
    if (retried.status === 401) return expire('rejected-after-refresh')
    return retried
  }

  async function json<T>(url: string, requestOptions?: RequestOptions): Promise<T> {
    const response = await apiFetch(url, requestOptions)
    if (!response.ok) {
      throw new ApiError(response.status, await readErrorBody(response))
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  return { fetch: apiFetch, json }
}
