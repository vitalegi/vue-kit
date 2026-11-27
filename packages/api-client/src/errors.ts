/** Risposta HTTP non 2xx ricevuta da {@link ApiClient.json}. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    /** corpo della risposta: JSON se interpretabile, altrimenti testo; null se vuoto */
    public readonly body: unknown,
  ) {
    super(`Errore API: ${status}`)
    this.name = 'ApiError'
  }
}

/**
 * Perché la sessione è scaduta:
 * - `refresh-failed`: il refresh non è riuscito (cookie scaduto o revocato, rete assente);
 * - `rejected-after-refresh`: il refresh è riuscito ma l'API rifiuta comunque (utente disabilitato, permessi revocati).
 */
export type SessionExpiredReason = 'refresh-failed' | 'rejected-after-refresh'

/** La richiesta non può proseguire perché la sessione non è più valida. */
export class SessionExpiredError extends Error {
  constructor(public readonly reason: SessionExpiredReason) {
    super(reason === 'refresh-failed' ? 'Sessione scaduta' : 'Sessione non valida')
    this.name = 'SessionExpiredError'
  }
}
