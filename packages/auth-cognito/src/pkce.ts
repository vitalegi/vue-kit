/** Funzioni PKCE (RFC 7636) con la Web Crypto API del browser. */

export function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Stringa casuale base64url da 32 byte: usata come code verifier e come state. */
export function generateRandomString(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array.buffer)
}

/** Code challenge S256: base64url(SHA-256(verifier)). */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(digest)
}

export interface AuthorizeUrlParams {
  cognitoDomain: string
  clientId: string
  redirectUri: string
  scope: string
  codeChallenge: string
  state: string
  extraParams?: Record<string, string>
}

export function buildAuthorizeUrl(p: AuthorizeUrlParams): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: p.scope,
    code_challenge: p.codeChallenge,
    code_challenge_method: 'S256',
    state: p.state,
    ...p.extraParams,
  })
  return `${p.cognitoDomain.replace(/\/$/, '')}/oauth2/authorize?${params}`
}
