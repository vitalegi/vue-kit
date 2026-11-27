import { describe, expect, it } from 'vitest'
import { base64UrlEncode, buildAuthorizeUrl, generateCodeChallenge, generateRandomString } from '../pkce.js'

describe('pkce', () => {
  describe('given the RFC 7636 example verifier', () => {
    it('then the S256 challenge matches the one in the specification', async () => {
      const challenge = await generateCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
      expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    })
  })

  describe('when a random string is generated', () => {
    it('then it is base64url (43 chars for 32 bytes) and different every time', () => {
      const a = generateRandomString()
      const b = generateRandomString()
      expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
      expect(a).not.toBe(b)
    })
  })

  describe('when bytes are base64url encoded', () => {
    it('then +, / and padding are replaced', () => {
      expect(base64UrlEncode(new Uint8Array([251, 255, 191]).buffer)).toBe('-_-_')
      expect(base64UrlEncode(new Uint8Array([1]).buffer)).toBe('AQ')
    })
  })

  describe('when the authorize URL is built', () => {
    it('then it carries the PKCE and OAuth parameters, plus the extra ones', () => {
      const url = new URL(
        buildAuthorizeUrl({
          cognitoDomain: 'https://example.auth.eu-south-1.amazoncognito.com/',
          clientId: 'client-1',
          redirectUri: 'https://app.example.com/callback',
          scope: 'openid email',
          codeChallenge: 'challenge',
          state: 'state-1',
          extraParams: { identity_provider: 'Google' },
        }),
      )
      expect(url.origin + url.pathname).toBe('https://example.auth.eu-south-1.amazoncognito.com/oauth2/authorize')
      expect(Object.fromEntries(url.searchParams)).toEqual({
        response_type: 'code',
        client_id: 'client-1',
        redirect_uri: 'https://app.example.com/callback',
        scope: 'openid email',
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        state: 'state-1',
        identity_provider: 'Google',
      })
    })
  })
})
