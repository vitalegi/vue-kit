# vue-kit

Workspace pnpm con il codice condiviso dai frontend Vue di vitalegi (pathfinder-fe, spesucce-fe, mangar-fe e i prossimi).

- **Stack comune e assunzioni**: [`docs/frontend-stack.md`](docs/frontend-stack.md). È il documento di riferimento per tutti i frontend: va tenuto aggiornato qui, e i `CLAUDE.md` dei singoli progetti puntano a questo file.
- **Uso, sviluppo e rilasci**: [`README.md`](README.md).

## Pacchetti

- `packages/api-client` (`@vitalegi/api-client`): TypeScript puro, **nessuna dipendenza da Vue**. Non va aggiunta.
- `packages/auth-cognito` (`@vitalegi/auth-cognito`): `vue`, `pinia` e `vue-router` sono peer dependency, non dipendenze.

Un pezzo di codice entra nel kit solo se serve ad almeno due app. Restano nelle app:

- il codice di dominio;
- i componenti specifici di una singola app;
- le variabili d'ambiente.

## Regole di lavoro

- **Richieste ambigue**: se una richiesta non è chiara, fermarsi e chiedere prima di lavorare. Se si può leggere in più modi che portano a lavoro diverso, fare una domanda breve con le opzioni, anche se una lettura sembra la più probabile. Sui dettagli con una scelta ovvia procedere, e dirlo.
- **TDD**: prima il test che fallisce, poi il codice.
- **Struttura dei test**: blocchi annidati `describe('given …')` / `describe('when …')` / `it('then …')`, in `src/__tests__/` accanto al codice.
- **Contenuto dei test**: ogni test ha almeno un'asserzione e verifica un comportamento del codice, mai solo i dati messi nei mock.
- **Mock**: tipizzati (`vi.fn<typeof fetch>()`), come richiede oxlint.
- **Rilasci**: ogni modifica a un pacchetto da rilasciare include un **changeset** (`pnpm changeset`). Le modifiche incompatibili sono `major` e vanno descritte nel changeset con le istruzioni di migrazione per le app.
- **Dipendenze nuove**: chiedere prima di aggiungerle. Solo licenze MIT o Apache-2.0, nessuna che richieda una chiave di licenza.
- **Controlli**: prima di ogni commit `pnpm check` (formattazione, lint, type-check, test, build).
- **Documentazione**: i README dei pacchetti descrivono API e opzioni, e si aggiornano nello stesso commit della modifica.
- **Lingua**: documentazione e commenti in italiano, messaggi di commit in inglese.

## Note tecniche

- Nei test e nel type-check i pacchetti del workspace si risolvono dai sorgenti (alias in `vitest.config.ts`, `paths` nei `tsconfig.json`). Il build usa `dist/` (`tsconfig.build.json`).
- Output ESM con import senza estensione: va consumato tramite un bundler (Vite), non direttamente da Node.
- Gli script della root filtrano i pacchetti con `--filter './packages/*'`. Gli apici servono: senza, la shell espande il glob.
